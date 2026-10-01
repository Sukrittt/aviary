import { useMemo } from 'react'
import { parseChatMarkdown, type Run } from '@/src/lib/chatMarkdown'

function Runs({ runs }: { runs: Run[] }) {
  return runs.map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : run.text))
}

/** Renders an Ask Aviary answer: paragraphs, bullet/numbered lists, bold runs. */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseChatMarkdown(text), [text])
  return (
    <div className="brain-md">
      {blocks.map((block, i) => {
        if (block.type === 'p') return <p key={i}><Runs runs={block.runs} /></p>
        const items = block.items.map((item, j) => <li key={j}><Runs runs={item} /></li>)
        return block.type === 'ol' ? <ol key={i} start={block.start}>{items}</ol> : <ul key={i}>{items}</ul>
      })}
    </div>
  )
}
