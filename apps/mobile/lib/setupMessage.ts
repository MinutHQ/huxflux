/** Holds a message queued during agent setup, consumed by the agent chat screen on mount. */
let _pending: string | null = null

export function setSetupMessage(msg: string | null) {
  _pending = msg
}

export function consumeSetupMessage(): string | null {
  const msg = _pending
  _pending = null
  return msg
}
