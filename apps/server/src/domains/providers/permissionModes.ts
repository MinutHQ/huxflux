import type { PermissionMode } from "@huxflux/shared"
import type { ProviderAdapter } from "./providers.types.js"

// Most permissive last. Used to pick a provider's closest supported mode when
// it cannot honour the one that was asked for.
const BY_PERMISSIVENESS: PermissionMode[] = [
  "plan",
  "dontAsk",
  "default",
  "acceptEdits",
  "auto",
  "bypassPermissions",
]

/**
 * The mode a provider will actually run in.
 *
 * Providers differ in what they can enforce: only Claude speaks the control
 * protocol that lets a tool call be put to the user, so the others advertise
 * just the extremes. The picker already hides unsupported modes, but a mode
 * can still arrive here unsupported — an agent whose provider was switched
 * after the mode was chosen, a value from the API, or a server default that
 * one provider cannot meet. Rather than failing the turn, fall back to the
 * nearest mode the provider does support that is no more permissive than the
 * one requested, so narrowing can never loosen what the user asked for.
 *
 * A provider advertising no modes at all has no permission concept; its
 * requested mode is returned unchanged and the adapter ignores it.
 */
export function resolvePermissionMode(
  provider: Pick<ProviderAdapter, "capabilities">,
  requested: PermissionMode,
): PermissionMode {
  const supported = provider.capabilities.permissionModes
  if (supported.length === 0 || supported.includes(requested)) return requested

  const requestedRank = BY_PERMISSIVENESS.indexOf(requested)
  let best: PermissionMode | null = null
  for (const mode of supported) {
    const rank = BY_PERMISSIVENESS.indexOf(mode)
    if (rank > requestedRank) continue
    if (best === null || rank > BY_PERMISSIVENESS.indexOf(best)) best = mode
  }

  // Nothing is as restrictive as what was asked for. Take the provider's most
  // restrictive option instead of silently granting more than was requested.
  if (best === null) {
    for (const mode of supported) {
      if (best === null || BY_PERMISSIVENESS.indexOf(mode) < BY_PERMISSIVENESS.indexOf(best)) best = mode
    }
  }
  return best ?? requested
}
