---
name: scaffold-component
description: Create a new domain-internal React component inside an existing domain. Produces a file that passes lint by construction (size cap, allowed icons, design-system colors).
---

# scaffold-component

The user wants a new component scaffolded inside an existing domain.

## Arguments

- Component name (PascalCase, required, e.g. `MessageInput`)
- Domain (required, e.g. `chat`, `tasks`)
- Platform (optional: `web` / `mobile`. Default: `web`.)

If anything is missing, ask once.

## Target file

| Platform | Path |
|----------|------|
| web | `apps/web/src/domains/<domain>/components/<Name>.tsx` |
| mobile | `apps/mobile/domains/<domain>/components/<Name>.tsx` |

If the `components/` directory doesn't exist yet, create it.

## Verify before creating

- The domain folder exists (`apps/<platform>/src/domains/<domain>/` or the mobile equivalent). If not, refuse — ask the user to run `/scaffold-domain <domain>` first.
- The component file doesn't already exist. Refuse if it does.

## Web component template

```tsx
import { cn } from '@huxflux/ui'

interface <Name>Props {
  className?: string
}

export function <Name>({ className }: <Name>Props) {
  return (
    <div className={cn('', className)}>
      <Name />
    </div>
  )
}
```

## Mobile component template

```tsx
import { View, Text, type ViewStyle, type StyleProp } from 'react-native'

interface <Name>Props {
  style?: StyleProp<ViewStyle>
}

export function <Name>({ style }: <Name>Props) {
  return (
    <View style={style}>
      <Text>{'<Name>'}</Text>
    </View>
  )
}
```

Use plain RN primitives. No web-only imports. Mobile styles use the `style` prop with inline objects or `StyleSheet.create`, never `className` (Tailwind classes do not run in React Native here).

## Rules baked in

- Default export is the named function — no `export default`.
- No imports from `lucide-react`. If the component needs icons, use `@tabler/icons-react` on web or `@expo/vector-icons` on mobile.
- No hardcoded Tailwind color classes (`zinc-*`, `slate-*`, `gray-*`). Use design-system tokens.
- File stays small. The 300-line `.tsx` cap applies.
- The component is NOT exported from `index.ts` unless the user explicitly asks. Domain-internal components stay internal.

## Steps

1. Validate the domain exists.
2. Create the components/ directory if needed.
3. Write the file using the template, substituting the component name.
4. Run `pnpm lint` against the new file. If it fails, fix and re-run before reporting done.
5. Report the path.

## Do not

- Do not auto-add the component to `index.ts`. Domain-internal components are NOT public surface.
- Do not add CSS imports, story files, or test files unless the user asks.
- Do not exceed 80 lines in a single function. If the template's body grows, split into smaller helpers in the same file.
