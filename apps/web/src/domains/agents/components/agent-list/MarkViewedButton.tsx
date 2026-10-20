import { IconChecks } from "@tabler/icons-react"
import { Button } from "@huxflux/ui"

interface MarkViewedButtonProps {
  onClick: () => void
}

/**
 * Hover-revealed button in a sidebar group header that marks every unread
 * agent in the group as viewed. The header must carry the `group` class.
 */
export function MarkViewedButton({ onClick }: MarkViewedButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title="Mark all as viewed"
      aria-label="Mark all as viewed"
      onClick={onClick}
      className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground"
    >
      <IconChecks size={13} />
    </Button>
  )
}
