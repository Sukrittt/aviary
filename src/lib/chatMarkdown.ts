/**
 * Parser for the small markdown subset Ask Aviary is allowed to write (see
 * OUTPUT FORMAT in lib/ai/moneyBrainPrompt.ts): paragraphs, "- " and "1. "
 * lists, and **bold**. Anything else passes through as text. Runs on every
 * streamed delta, so half-written input must parse too. Mirrored in
 * Mobile/src/lib/chatMarkdown.ts; keep the two in sync.
 */

export interface Run {
  text: string
  bold: boolean
}

export type Block =
  | { type: 'p'; runs: Run[] }
  | { type: 'ul'; items: Run[][] }
  | { type: 'ol'; start: number; items: Run[][] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/

/** Splits on `**`. An unclosed marker (mid-stream) bolds the rest rather than showing the asterisks. */
export function parseInline(text: string): Run[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((run) => run.text !== '')
}

export function parseChatMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', runs: parseInline(paragraph.join('\n')) })
    paragraph = []
  }

  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)

    if (bullet || numbered) flush()
    const last = blocks.at(-1)

    if (bullet) {
      // A blank line between items shouldn't split one list into many.
      if (last?.type === 'ul') last.items.push(parseInline(bullet[1]))
      else blocks.push({ type: 'ul', items: [parseInline(bullet[1])] })
    } else if (numbered) {
      if (last?.type === 'ol') last.items.push(parseInline(numbered[2]))
      else blocks.push({ type: 'ol', start: Number(numbered[1]), items: [parseInline(numbered[2])] })
    } else if (line.trim() === '') {
      flush()
    } else {
      // The prompt forbids headings; if one slips through, show it as a bold line.
      const heading = HEADING.exec(line)
      paragraph.push(heading ? `**${heading[1].replaceAll('**', '')}**` : line)
    }
  }
  flush()
  return blocks
}
