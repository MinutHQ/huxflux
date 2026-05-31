# packages/ui — Agent Rules

Headless UI primitives. shadcn-style. Imported by web and (where applicable) mobile.

Read the root CLAUDE.md first.

## Layout

```
src/
  button.tsx, badge.tsx, popover.tsx, ...    One primitive per file.
  modal.tsx                                   Portal-rendered overlay dialog.
  anchored-popover.tsx                        Manual-anchored floating panel.
  index.ts                                    Barrel export.
  utils.ts                                    cn() helper.
```

## Composed primitives

A few primitives here go beyond pure shadcn wrappers because the same
manual-portal pattern was duplicated across many feature dialogs. These live
here because three or more consumers shared the boilerplate and centralising
the eslint-disabled ref reads keeps the consumers clean.

- `Modal` — centered overlay dialog with backdrop + ESC + close X. Use
  `asForm onSubmit={...}` for form dialogs.
- `AnchoredPopover` — floating panel positioned relative to a trigger ref.
  Wraps the `getBoundingClientRect()` read so consumers don't need to repeat
  the lint suppression. For most popovers, prefer the radix `Popover`; reach
  for `AnchoredPopover` only when you need bespoke positioning (e.g. right-edge
  alignment, top-up placement, custom cross-axis nudges).

## Rules

- Primitives only. No feature code. No domain logic.
- Style with Tailwind CSS-variable classes from the design system tokens. Never hardcoded color scales.
- Add new primitives only when there's a real shared need. Don't pre-emptively wrap shadcn components.
- Use `/add-shadcn-primitive` to add a new shadcn primitive — it adapts the source to live here with the right conventions.
- Re-export every primitive from `src/index.ts`.

## When NOT to add something here

- If it's specific to one feature → it belongs in that domain.
- If it composes multiple primitives in a feature-specific way → that's a domain component.
- If only one app uses it → live in that app, not here.

## Testing

No test setup. Do not add one without explicit user request.
