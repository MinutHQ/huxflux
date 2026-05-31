# apps/docs — Agent Rules

Next.js docs site. Content-first.

Read the root CLAUDE.md first.

## Layout

```
app/                 Next.js app router.
content/             Documentation source (MDX or similar).
components/          Site components (NOT feature domains — this is a docs site).
lib/                 Helpers for the docs build.
public/              Static assets.
```

## Rules

- This app does NOT use the `domains/` pattern. It's a content-driven site.
- New docs pages go in `content/` (or `app/` depending on routing model — check existing files first).
- Components are docs-site primitives: nav, code block, callout, etc. Not feature components.
- Do not duplicate types from `@huxflux/shared` here. Import them if you need to render API surface in docs.

## Testing

No test setup. Do not add one without explicit user request.
