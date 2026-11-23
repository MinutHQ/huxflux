import { stripSycophancy } from "../utils"
import { Markdown } from "./Markdown"

// Chat messages share the full markdown renderer so tables and [text](url)
// links render the same as in PR comments.
export function MessageContent({ text }: { text: string }) {
  return <Markdown content={stripSycophancy(text)} fontSize={14} />
}
