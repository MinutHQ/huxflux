// ---------------------------------------------------------------------------
// Base palette — warm stone/taupe (matches radix-nova taupe preset)
// ---------------------------------------------------------------------------
const stone = {
  50:  '#fafaf9',
  100: '#f5f5f4',
  200: '#e7e5e4',
  300: '#d6d3d1',
  400: '#a8a29e',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  750: '#3c3835',
  800: '#292524',
  850: '#211f1c',
  900: '#1c1917',
  950: '#0c0a09',
} as const

// ---------------------------------------------------------------------------
// Dark mode design tokens — map 1:1 to CSS custom properties
// camelCase here becomes kebab-case CSS vars: cardForeground → --card-foreground
// ---------------------------------------------------------------------------
export const dark = {
  // Base
  background:               stone[900],
  foreground:               stone[50],
  // Card / Popover
  card:                     stone[800],
  cardForeground:           stone[50],
  popover:                  stone[800],
  popoverForeground:        stone[50],
  // Primary — warm off-white CTA in dark mode
  primary:                  stone[200],
  primaryForeground:        stone[800],
  // Secondary / Muted / Accent (same value, different semantic roles)
  secondary:                stone[750],
  secondaryForeground:      stone[50],
  muted:                    stone[750],
  mutedForeground:          stone[400],
  accent:                   stone[750],
  accentForeground:         stone[50],
  // Input placeholder text
  placeholder:              stone[600],
  // Destructive
  destructive:              '#f87171',
  // Borders & inputs
  border:                   'rgba(255, 255, 255, 0.10)',
  input:                    'rgba(255, 255, 255, 0.15)',
  ring:                     stone[500],
  // Sidebar
  sidebar:                  stone[800],
  sidebarForeground:        stone[50],
  sidebarPrimary:           '#6366f1',
  sidebarPrimaryForeground: stone[50],
  sidebarAccent:            stone[750],
  sidebarAccentForeground:  stone[50],
  sidebarBorder:            'rgba(255, 255, 255, 0.10)',
  sidebarRing:              stone[500],
} as const

// ---------------------------------------------------------------------------
// Semantic status colors — same hex values across all platforms.
// `tw` fields are for web Tailwind class names.
// ---------------------------------------------------------------------------
export const statusColors = {
  'in-progress': {
    color:  '#fbbf24',
    bg:     'rgba(251, 191, 36, 0.10)',
    border: 'rgba(251, 191, 36, 0.25)',
    tw: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', dot: 'bg-amber-400' },
  },
  'in-review': {
    color:  '#60a5fa',
    bg:     'rgba(96, 165, 250, 0.10)',
    border: 'rgba(96, 165, 250, 0.25)',
    tw: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25', dot: 'bg-blue-400' },
  },
  'done': {
    color:  '#34d399',
    bg:     'rgba(52, 211, 153, 0.10)',
    border: 'rgba(52, 211, 153, 0.25)',
    tw: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-500' },
  },
  'cancelled': {
    color:  '#f87171',
    bg:     'rgba(248, 113, 113, 0.10)',
    border: 'rgba(248, 113, 113, 0.25)',
    tw: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25', dot: 'bg-red-400' },
  },
  'backlog': {
    color:  stone[400],
    bg:     'rgba(168, 162, 158, 0.10)',
    border: 'rgba(168, 162, 158, 0.25)',
    tw: { color: 'text-stone-400', bg: 'bg-stone-500/10', border: 'border-stone-500/25', dot: 'bg-stone-500' },
  },
} as const

// ---------------------------------------------------------------------------
// Diff colors
// ---------------------------------------------------------------------------
export const diffColors = {
  addition:   '#34d399',
  deletion:   '#f87171',
  additionBg: 'rgba(52, 211, 153, 0.08)',
  deletionBg: 'rgba(239, 68, 68, 0.08)',
} as const

// ---------------------------------------------------------------------------
// PR / review colors
// ---------------------------------------------------------------------------
export const prColors = {
  merged:           '#a78bfa',
  changesRequested: '#fb923c',
  readyToMerge:     '#34d399',
  draft:            stone[400],
  inReview:         '#60a5fa',
} as const

export type DarkTokens = typeof dark
export type StatusKey  = keyof typeof statusColors
