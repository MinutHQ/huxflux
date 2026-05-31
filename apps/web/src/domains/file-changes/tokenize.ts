/**
 * Minimal lexical tokenizer used by `FileContentView` to colorize file content
 * without pulling in a full syntax highlighter.
 *
 * Patterns are tried in order; the first match wins. The catch-all at the end
 * guarantees forward progress on any input.
 */
export function tokenize(text: string): Array<{ cls: string; text: string }> {
  const tokens: Array<{ cls: string; text: string }> = []
  let rest = text

  const patterns: Array<{ re: RegExp; cls: string }> = [
    { re: /^(\/\/[^\n]*)/, cls: "text-muted-foreground/70 italic" },
    { re: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, cls: "text-amber-300" },
    { re: /^(\$\{[^}]*\})/, cls: "text-sky-300" },
    { re: /^(\b(?:async|await|return|const|let|var|function|class|import|export|from|if|else|try|catch|throw|new|this|typeof|private|readonly|public)\b)/, cls: "text-violet-400" },
    { re: /^(\b(?:string|number|boolean|Promise|void|undefined|null|Date)\b)/, cls: "text-sky-400" },
    { re: /^(\b[A-Z][a-zA-Z0-9]*\b)/, cls: "text-teal-400" },
    { re: /^(\b\d+(?:px|em|rem|s)?\b)/, cls: "text-orange-300" },
    { re: /^([()[\]{}<>:;,=+\-*/%&|!?.@])/, cls: "text-muted-foreground/70" },
    { re: /^(\w+)/, cls: "text-foreground/90" },
    { re: /^(\s+)/, cls: "" },
    { re: /^(.)/, cls: "text-muted-foreground/70" },
  ]

  while (rest.length > 0) {
    let matched = false
    for (const { re, cls } of patterns) {
      const m = rest.match(re)
      if (m && m[1] !== undefined) {
        tokens.push({ cls, text: m[1] })
        rest = rest.slice(m[1].length)
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push({ cls: "", text: rest[0] ?? "" })
      rest = rest.slice(1)
    }
  }
  return tokens
}
