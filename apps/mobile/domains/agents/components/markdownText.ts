// Splits on fenced (```) and inline (`) code and applies `fn` only to the text
// outside them, so HTML clean-up never rewrites code like `Array<string>`.
// An unclosed fence (common while a reply is streaming) runs to the end.
const codeSpan = /(```[\s\S]*?(?:```|$)|`[^`\n]+`)/

export function mapOutsideCode(text: string, fn: (s: string) => string): string {
  return text
    .split(codeSpan)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("")
}
