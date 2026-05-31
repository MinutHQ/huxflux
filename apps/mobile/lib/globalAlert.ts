// Deferred global alert handler. `app/_layout.tsx` registers the ModalProvider-
// backed implementation once it mounts; everything else (e.g. the agent error
// handler from @huxflux/shared) reaches into the registered function via
// `getGlobalAlert()`. Kept out of `_layout.tsx` so that file only exports a
// component (fast-refresh requirement).
type AlertFn = (title: string, message?: string) => void

let alertFn: AlertFn | null = null

export function setGlobalAlert(fn: AlertFn | null) { alertFn = fn }
export function getGlobalAlert(): AlertFn | null { return alertFn }
