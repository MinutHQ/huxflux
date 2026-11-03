import { describe, expect, it } from "vitest"
import type { PermissionMode } from "@huxflux/shared"
import { resolvePermissionMode } from "./permissionModes.js"

function provider(permissionModes: PermissionMode[]) {
  return { capabilities: { permissionModes } } as Parameters<typeof resolvePermissionMode>[0]
}

const CLAUDE: PermissionMode[] = ["plan", "default", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]
const TWO_WAY: PermissionMode[] = ["plan", "bypassPermissions"]

describe("resolvePermissionMode", () => {
  it("passes a supported mode through untouched", () => {
    for (const mode of CLAUDE) {
      expect(resolvePermissionMode(provider(CLAUDE), mode)).toBe(mode)
    }
  })

  it("never loosens what was asked for", () => {
    // Gemini cannot ask the user, so "default" must not become "bypassPermissions".
    expect(resolvePermissionMode(provider(TWO_WAY), "default")).toBe("plan")
    expect(resolvePermissionMode(provider(TWO_WAY), "auto")).toBe("plan")
    expect(resolvePermissionMode(provider(TWO_WAY), "acceptEdits")).toBe("plan")
    expect(resolvePermissionMode(provider(TWO_WAY), "dontAsk")).toBe("plan")
  })

  it("keeps the unrestricted mode when that is what was asked for", () => {
    expect(resolvePermissionMode(provider(TWO_WAY), "bypassPermissions")).toBe("bypassPermissions")
  })

  it("falls back to the most restrictive option when nothing is restrictive enough", () => {
    // Codex only has the unrestricted mode; asking for "plan" cannot be met,
    // and the fallback must be the provider's most restrictive, not a silent
    // upgrade to something else.
    expect(resolvePermissionMode(provider(["bypassPermissions"]), "plan")).toBe("bypassPermissions")
  })

  it("returns the request unchanged for a provider with no permission concept", () => {
    expect(resolvePermissionMode(provider([]), "auto")).toBe("auto")
    expect(resolvePermissionMode(provider([]), "plan")).toBe("plan")
  })

  it("picks the closest supported mode rather than the most restrictive one", () => {
    // "auto" is unavailable; "acceptEdits" is the nearest that is no more
    // permissive, and should win over the stricter "plan".
    const partial: PermissionMode[] = ["plan", "acceptEdits", "bypassPermissions"]
    expect(resolvePermissionMode(provider(partial), "auto")).toBe("acceptEdits")
  })
})
