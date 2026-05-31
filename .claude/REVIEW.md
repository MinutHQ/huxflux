# Hive Codebase Review
_Conducted 2026-04-01_

---

## Architecture

### Completed
- **Merged `apps/desktop/src/` into `apps/web/src/`** — deleted ~5,500 lines of duplicated code. Desktop Tauri shell now uses `apps/web` as its sole frontend via a root-redirecting `apps/desktop/vite.config.ts`. Desktop-specific features (`TitleBar`, `UpdateBanner`, `useUpdater`) live in `apps/web/src` behind an `isTauri` guard.
- **`isTauri` detection** — `apps/web/src/lib/platform.ts` combines a build-time check (`import.meta.env.TAURI_PLATFORM`, for tree-shaking) with a runtime fallback (`__TAURI_INTERNALS__ in window`, for `tauri dev`).
- **Native title bar** — switched from custom HTML traffic lights + `decorations: false` to `titleBarStyle: "overlay"` + `hiddenTitle: true`. macOS now renders native rounded corners and native traffic lights overlaid on the sidebar's drag-region spacer.

### Still Pending (next priorities)
1. **Move hooks to `@hive/shared`** — `useNotifications`, `useServers`, `useWorkspace`, `useStreamingAgentId` are in `apps/web/src/hooks/` and should move to `packages/shared/src/hooks/`. Delete `useServerStatus` from `apps/web/src/hooks/` (already in shared).
2. **Move lib utils to `@hive/shared`** — `theme.ts`, `notificationPrefs.ts`, `sounds.ts`, `flags.ts` from `apps/web/src/lib/` are all platform-agnostic and should move to `packages/shared/src/lib/`.
3. **`@hive/ui` should own its deps** — `apps/web/package.json` imports Radix primitives directly instead of through `@hive/ui`. Move `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge` to `packages/ui/package.json` deps and remove from web.
4. **Remove `lucide-react`** — present in `apps/web/package.json` and `apps/desktop/package.json`. The project uses `@tabler/icons-react` exclusively. Any accidental import would ship wrong icons.
5. **Remove `shadcn` from runtime deps** — it's a CLI tool, not a runtime package.
6. **Mobile NativeWind config** — `apps/mobile/tailwind.config.js` has dead wrong colors and the Babel plugin isn't registered. Either wire it up or delete it.
7. **Delete `apps/mobile/App.tsx`** — vestigial Expo boilerplate, superseded by `app/_layout.tsx`.

---

## Server — Security (apps/server/src/)

### Critical
| Issue | Location | Fix |
|---|---|---|
| **Path traversal — file read/write** | `routes/files.ts:29,65,86` | Validate `filePath` is relative, no `..` or absolute prefix before passing to git/fs ops |
| **Path traversal — fs browse** | `routes/fs.ts:74` | Reject paths outside home dir; strip `..` segments |
| **Command injection via setupScript** | `routes/agents.ts:15–29` | Use `execFile` with arg array instead of `sh -c`; allowlist or remove the feature |
| **Sandbox network isolation unimplemented** | `sandbox.ts:130–135` | Code comment acknowledges `allowedHosts` is not enforced — Claude subprocess has unrestricted network access |
| **No sandboxing on macOS** | `sandbox.ts:100–102` | `firejail` is Linux-only; macOS runs Claude completely unsandboxed |

### High / Medium
- `upload.ts` path check fragile — use `path.relative()` instead of `startsWith(dir + sep)`
- WebSocket auth token in query params — visible in logs/proxies (`auth.ts:14`)
- No bounds checking on `limit` param in `routes/terminal.ts`
- Agent `location` param not validated — could create worktrees outside workspace
- CORS `true` by default — permissive in dev, easy to ship accidentally
- PTY not killed on socket `error` event — only cleaned up on `close`
- No pagination — all agents/messages loaded into memory
- Detailed internal paths in error responses leak filesystem structure

### Positive
- Timing-safe token comparison (`timingSafeEqual`) ✓
- Auth hook applied globally ✓
- Drizzle ORM parameterized queries — no SQL injection ✓
- WAL mode + FK constraints on SQLite ✓

---

## Frontend — React Quality (apps/web/src/)

### Critical / High
- **`lucide-react` installed** — must be removed; only `@tabler/icons-react` should exist
- **113+ hardcoded Tailwind colors** — `text-amber-400`, `text-emerald-400`, `bg-blue-500/10` etc. throughout all components. `@hive/tokens` exists for this; use it.
- **Non-null assertion crash** — `Sidebar.tsx:871`: `map.get(repoId)!.agents.push(agent)` — throws if key absent
- **Silent `JSON.parse` failures** — `ChatView.tsx:285,301` catch blocks swallow tool call argument parse errors silently
- **`(window as any).__huxflux_flags`** in `flags.ts` — use `declare global { interface Window { ... } }` instead

### Medium
- `useServerStatus` duplicated in `apps/web/src/hooks/` despite existing in `@hive/shared` — delete and import from shared
- Two `useEffect` dependency array issues suppressed with `eslint-disable` comments instead of being fixed properly
- TanStack Router installed but unused — state-based routing (`view: "app" | "settings"`) doesn't support deep links or browser back button
- No error boundary — any render error crashes the entire app
- `SettingsPage.tsx` and `Sidebar.tsx` are very large and should be split

---

## Mobile (apps/mobile/)

- Architecture is clean — `@hive/shared` and `@hive/tokens` properly consumed, no logic duplication ✓
- Hardcoded diff syntax highlight colors in `app/agent/[id]/diff.tsx:9–21` — should reference `@hive/tokens`
- Hardcoded model list in chat screen — should come from server or shared config
- File attachments stubbed with "coming soon" alert

---

## Cross-Cutting

| Issue | Affected |
|---|---|
| `lucide-react` in deps | web, desktop |
| `shadcn` as runtime dep (should be devDep or removed) | web, desktop |
| TanStack Router installed, not wired | web, desktop |
| Error handling inconsistent (Alert vs toast vs silence) | all platforms |
| Design tokens not used in components (hardcoded colors) | web, desktop, mobile |
