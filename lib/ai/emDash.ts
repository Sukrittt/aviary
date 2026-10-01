/**
 * The em dash is the loudest AI-writing tell, and the prompt asking Gemini to
 * avoid it is a request, not a guarantee. Every Ask Aviary reply goes through
 * here so none reach the user. En dashes (ranges like 1,000–2,000) are left alone.
 */
export function scrubEmDashes(text: string): string {
  return text.replace(/[ \t]*—[ \t]*(?=\n|$)/g, '').replace(/\s*—\s*/g, ', ')
}

/**
 * Streaming version. A dash and its surrounding spaces can straddle chunks, so
 * any trailing run of whitespace and dashes is held back until the next chunk
 * shows how it ends. Call `flush` once the stream is done.
 */
export function createEmDashScrubber() {
  let held = ''
  return {
    push(chunk: string): string {
      const text = held + chunk
      const tail = /[\s—]*$/.exec(text)?.[0] ?? ''
      held = tail
      return scrubEmDashes(text.slice(0, text.length - tail.length))
    },
    flush(): string {
      const rest = scrubEmDashes(held)
      held = ''
      return rest
    },
  }
}
