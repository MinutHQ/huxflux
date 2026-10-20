/**
 * Rolling tail of PTY output, replayed to a fresh xterm on (re)connect.
 *
 * Appends are amortised: the buffer grows to twice the cap before it is
 * trimmed, so heavy output does not copy the whole tail on every chunk.
 * Reads trim to the cap and start after the first newline, which keeps a
 * replay from opening mid escape sequence in the common case. Output with no
 * newline in the tail (e.g. a `\r` progress bar) falls back to a raw cut.
 */
export class PtyOutputBuffer {
  private buf = ""

  constructor(private readonly cap: number) {}

  append(data: string): void {
    this.buf += data
    if (this.buf.length > this.cap * 2) this.buf = trimToLineBoundary(this.buf, this.cap)
  }

  read(): string {
    if (this.buf.length > this.cap) this.buf = trimToLineBoundary(this.buf, this.cap)
    return this.buf
  }
}

/** Keep at most `cap` trailing chars, dropping the partial first line. */
export function trimToLineBoundary(buf: string, cap: number): string {
  if (buf.length <= cap) return buf
  const tail = buf.slice(-cap)
  const newline = tail.indexOf("\n")
  return newline === -1 ? tail : tail.slice(newline + 1)
}
