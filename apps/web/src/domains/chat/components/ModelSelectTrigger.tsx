import { Button, cn } from "@huxflux/ui"
import { IconAsterisk, IconBrandOpenai, IconChevronDown, IconSparkles } from "@tabler/icons-react"

export function ModelSelectTrigger({ provider, providerName, label, open, onClick }: {
  provider: string
  providerName: string
  label: string
  open: boolean
  onClick: () => void
}) {
  const color = provider === "claude"
    ? "border-orange-500/60 bg-orange-500/20 text-orange-950 hover:bg-orange-500/30 hover:text-orange-950 aria-expanded:bg-orange-500/30 aria-expanded:text-orange-950 dark:border-orange-400/70 dark:bg-orange-500/30 dark:text-orange-50 dark:hover:bg-orange-500/40 dark:hover:text-orange-50 dark:aria-expanded:bg-orange-500/40 dark:aria-expanded:text-orange-50"
    : provider === "codex"
      ? "border-teal-500/60 bg-teal-500/20 text-teal-950 hover:bg-teal-500/30 hover:text-teal-950 aria-expanded:bg-teal-500/30 aria-expanded:text-teal-950 dark:border-teal-400/70 dark:bg-teal-500/30 dark:text-teal-50 dark:hover:bg-teal-500/40 dark:hover:text-teal-50 dark:aria-expanded:bg-teal-500/40 dark:aria-expanded:text-teal-50"
      : "border-border bg-accent text-foreground hover:bg-accent/80"
  const displayLabel = label.toLowerCase().startsWith(providerName.toLowerCase()) ? label : `${providerName} ${label}`

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Choose model: ${displayLabel}`}
      title={displayLabel}
      className={cn("h-8 max-w-full gap-2 rounded-xl border px-2.5 text-[12px] font-medium shadow-sm transition-colors", color)}
    >
      {provider === "claude" ? <IconAsterisk size={19} className="shrink-0 text-orange-400" />
        : provider === "codex" ? <IconBrandOpenai size={19} className="shrink-0" />
          : <IconSparkles size={18} className="shrink-0" />}
      <span className="truncate">{displayLabel}</span>
      <IconChevronDown size={15} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
    </Button>
  )
}
