// Platform-injected error handler for agent `error` WS events. Each app
// (web / mobile) registers its own surface (toast / alert) once during
// bootstrap. The default just logs so missing-registration doesn't swallow
// the error.

let _onError: (message: string) => void = (msg) => console.error("[agent error]", msg)

export function configureAgentErrorHandler(fn: (message: string) => void): void {
  _onError = fn
}

export function reportAgentError(message: string): void {
  _onError(message)
}
