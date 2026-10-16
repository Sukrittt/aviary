import { describe, it, expect, vi, beforeEach } from 'vitest'

const logMock = vi.fn(async () => undefined)
const generateContentStream = vi.fn()
const generateContent = vi.fn()

vi.mock('./usage', () => ({ logAiUsage: (...args: unknown[]) => logMock(...(args as [])) }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream, generateContent }
  },
  ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW' },
}))

process.env.GEMINI_API_KEY = 'test'
const { streamText, hedged, generateJSON, generateJSONFromImage } = await import('./gemini')
const caller = { userId: 'user_1', feature: 'chat' as const }

async function* chunks() {
  yield { text: 'a' }
  yield { text: 'b', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }
}

beforeEach(() => vi.clearAllMocks())

describe('streamText usage logging', () => {
  it('logs the final chunk usage once the stream is consumed', async () => {
    generateContentStream.mockResolvedValue(chunks())
    const texts: string[] = []
    for await (const c of await streamText('sys', [], caller)) texts.push(c.text ?? '')
    expect(texts).toEqual(['a', 'b'])
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith(caller, expect.any(String), expect.any(Number), { promptTokenCount: 10, candidatesTokenCount: 5 }, null)
  })

  it('still logs when the consumer stops early', async () => {
    generateContentStream.mockResolvedValue(chunks())
    for await (const _ of await streamText('sys', [], caller)) break
    expect(logMock).toHaveBeenCalledTimes(1)
  })

  it('logs a failed request start and rethrows', async () => {
    generateContentStream.mockRejectedValue(new Error('quota'))
    await expect(streamText('sys', [], caller)).rejects.toThrow('quota')
    expect(logMock).toHaveBeenCalledWith(caller, expect.any(String), expect.any(Number), undefined, expect.any(Error))
  })
})

describe('streamText retries', () => {
  it('retries once when Gemini answers 503 UNAVAILABLE', async () => {
    generateContentStream.mockRejectedValueOnce(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))
    generateContentStream.mockResolvedValueOnce(chunks())

    const texts: string[] = []
    for await (const c of await streamText('sys', [], caller)) texts.push(c.text ?? '')

    expect(texts).toEqual(['a', 'b'])
    expect(generateContentStream).toHaveBeenCalledTimes(2)
    // One call, one usage row: the retry is part of the same request.
    expect(logMock).toHaveBeenCalledTimes(1)
  })

  it('retries on the other model, since a demand spike hits one model at a time', async () => {
    generateContentStream.mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
    generateContentStream.mockResolvedValueOnce(chunks())
    for await (const _ of await streamText('sys', [], caller)) void _

    const [first, second] = generateContentStream.mock.calls.map(([req]) => req.model)
    expect(first).toBe('gemini-3.5-flash-lite')
    expect(second).toBe('gemini-3.5-flash')
    // The usage row is priced at the model that actually answered.
    expect(logMock).toHaveBeenCalledWith(caller, 'gemini-3.5-flash', expect.any(Number), expect.anything(), null)
  })

  it('retries a 429 too', async () => {
    generateContentStream.mockRejectedValueOnce(new Error('got status: 429 RESOURCE_EXHAUSTED'))
    generateContentStream.mockResolvedValueOnce(chunks())
    for await (const _ of await streamText('sys', [], caller)) break
    expect(generateContentStream).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry and logs the failure', async () => {
    generateContentStream.mockRejectedValue(new Error('503 UNAVAILABLE'))
    await expect(streamText('sys', [], caller)).rejects.toThrow('503')
    expect(generateContentStream).toHaveBeenCalledTimes(2)
    expect(logMock).toHaveBeenCalledWith(caller, expect.any(String), expect.any(Number), undefined, expect.any(Error))
  })

  it('does not retry an error that will not fix itself', async () => {
    generateContentStream.mockRejectedValue(new Error('400 INVALID_ARGUMENT'))
    await expect(streamText('sys', [], caller)).rejects.toThrow('400')
    expect(generateContentStream).toHaveBeenCalledTimes(1)
  })
})

describe('hedged', () => {
  const later = <T,>(ms: number, value: T, fail = false) => (signal: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms)
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) })
    })

  it('takes a fast primary without starting the backup', async () => {
    const backup = vi.fn(later(10, 'backup'))
    expect(await hedged(later(10, 'primary'), backup, 50)).toBe('primary')
    expect(backup).not.toHaveBeenCalled()
  })

  it('takes the backup when the primary is slow, and aborts the primary', async () => {
    let aborted = false
    const primary = (signal: AbortSignal) => {
      signal.addEventListener('abort', () => { aborted = true })
      return later(500, 'primary')(signal)
    }
    expect(await hedged(primary, later(10, 'backup'), 20)).toBe('backup')
    expect(aborted).toBe(true)
  })

  it('waits on the other call when one of two fails, and fails only when both do', async () => {
    expect(await hedged(later(60, 'primary'), later(5, 'nope', true), 10)).toBe('primary')
    await expect(hedged(later(30, 'p down', true), later(40, 'b down', true), 10)).rejects.toThrow('b down')
  })

  it('fails straight away when the primary fails before the backup starts', async () => {
    const backup = vi.fn(later(10, 'backup'))
    await expect(hedged(later(5, 'down', true), backup, 50)).rejects.toThrow('down')
    await new Promise((r) => setTimeout(r, 60))
    expect(backup).not.toHaveBeenCalled()
  })
})

describe('deadline', () => {
  /** A Gemini call that never answers, like the 2026-10-13 spike: it ends only when aborted. */
  const hang = ({ config }: { config: { abortSignal: AbortSignal } }) =>
    new Promise((_, reject) => config.abortSignal.addEventListener('abort', () => reject(new Error('This operation was aborted'))))

  it('gives up on a hung call at its deadline, so the route answers before Vercel kills it', async () => {
    generateContent.mockImplementation(hang)
    await expect(generateJSON('p', {}, caller, { timeoutMs: 20 })).rejects.toThrow('aborted')
    await expect(generateJSONFromImage('p', { data: '', mimeType: 'image/png' }, {}, caller, { timeoutMs: 20 })).rejects.toThrow('aborted')
  })

  it('shares one deadline between a call and its 503 retry', async () => {
    generateContent.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 15))
      throw new Error('503 UNAVAILABLE')
    })
    generateContent.mockImplementationOnce(hang)
    const started = Date.now()
    await expect(generateJSON('p', {}, caller, { timeoutMs: 40 })).rejects.toThrow('aborted')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('arms the chat stream too, so a stalled reply ends in an error frame', async () => {
    generateContentStream.mockResolvedValue(chunks())
    await streamText('sys', [], caller)
    const signal = generateContentStream.mock.calls[0][0].config.abortSignal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })
})
