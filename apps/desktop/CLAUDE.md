# apps/desktop — Agent Rules

Tauri shell that wraps the web app.

Read the root CLAUDE.md first.

## Layout

```
src/                 Renderer-side TypeScript (small — most logic lives in apps/web).
src-tauri/           Rust + Tauri config. Native side.
```

## Rules

- This app does NOT use the `domains/` pattern. It's a thin shell.
- Renderer code stays minimal. Logic belongs in `apps/web` and gets reused here.
- Tauri-specific glue (file system, notifications, updater) goes in `src/` or `src-tauri/`.
- Tauri plugins are referenced in `apps/web/package.json` (`@tauri-apps/api`, `@tauri-apps/plugin-*`) — the web app calls them directly.

## Testing

No test setup. Do not add one without explicit user request.
