# packages/tokens — Agent Rules

Design tokens. Source of truth for colors, spacing, radii.

Read the root CLAUDE.md first.

## Layout

```
src/
  tokens.ts          TS exports — for use in JS/TS (mobile, etc.).
  tokens.css         CSS variables — consumed by web Tailwind.
  build.ts           Build script that emits both formats from a single source if applicable.
```

## Rules

- This is the single source of truth for design tokens. Do not hardcode color values elsewhere.
- Color palette is warm taupe (radix-nova preset, taupe base). NOT zinc, NOT slate.
- If you need a new token, add it here and re-export from `index.ts` (if there is one). Document the intended use.
- The web app's `index.css` may import or reference tokens here.

## Testing

Not applicable (no logic to test).
