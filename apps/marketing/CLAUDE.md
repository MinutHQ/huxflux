# apps/marketing — Agent Rules

Static HTML experiments. Not part of the build pipeline.

Read the root CLAUDE.md first.

## What this is

- A collection of `index*.html` files used to iterate on marketing page designs.
- No build step, no package.json, no JS modules. Just HTML + inline styles/scripts.

## Rules

- Do not introduce a build pipeline here unless explicitly asked.
- Multiple versions (index-v2..v5.html) exist intentionally as design iterations.
- If asked to "update the landing page", confirm WHICH version first — the canonical one is `index.html` unless told otherwise.
- Do not import from packages here (it's static HTML, not a workspace).

## Testing / Lint / Typecheck

Not applicable.
