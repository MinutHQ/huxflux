/** Pure diff parsing and syntax highlighting — no React, works on web and mobile. */

export type DiffLineType = "add" | "del" | "ctx" | "hunk"

export interface DiffLine {
  type: DiffLineType
  text: string
  lineNo?: number
}

export interface DiffToken {
  cls: string
  text: string
}

export function parseUnifiedDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let addNo = 1
  let delNo = 1

  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+).*\+(\d+)/)
      if (m && m[1] && m[2]) {
        delNo = parseInt(m[1])
        addNo = parseInt(m[2])
      }
      lines.push({ type: "hunk", text: line })
    } else if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ")
    ) {
      // skip meta lines
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", text: line.slice(1), lineNo: addNo++ })
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", text: line.slice(1), lineNo: delNo++ })
    } else if (line.startsWith(" ")) {
      lines.push({ type: "ctx", text: line.slice(1), lineNo: addNo++ })
      delNo++
    }
  }

  return lines
}

const PATTERNS: Array<{ re: RegExp; cls: string }> = [
  { re: /^(\/\/[^\n]*)/, cls: "comment" },
  { re: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, cls: "string" },
  { re: /^(\$\{[^}]*\})/, cls: "template" },
  {
    re: /^(\b(?:async|await|return|const|let|var|function|class|import|export|from|if|else|try|catch|throw|new|this|typeof|private|readonly|public)\b)/,
    cls: "keyword",
  },
  {
    re: /^(\b(?:string|number|boolean|Promise|void|undefined|null|Date)\b)/,
    cls: "type",
  },
  { re: /^(\b[A-Z][a-zA-Z0-9]*\b)/, cls: "constructor" },
  { re: /^(\b\d+(?:px|em|rem|s)?\b)/, cls: "number" },
  { re: /^([()[\]{}<>:;,=+\-*/%&|!?.@])/, cls: "punctuation" },
  { re: /^(\w+)/, cls: "identifier" },
  { re: /^(\s+)/, cls: "whitespace" },
  { re: /^(.)/, cls: "other" },
]

export function tokenize(text: string): DiffToken[] {
  const tokens: DiffToken[] = []
  let rest = text

  while (rest.length > 0) {
    let matched = false
    for (const { re, cls } of PATTERNS) {
      const m = rest.match(re)
      if (m && m[1] !== undefined) {
        const matchText = m[1]
        tokens.push({ cls, text: matchText })
        rest = rest.slice(matchText.length)
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push({ cls: "other", text: rest[0]! })
      rest = rest.slice(1)
    }
  }

  return tokens
}
