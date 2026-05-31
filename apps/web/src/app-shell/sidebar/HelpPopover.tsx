import React from "react"
import { AnchoredPopover } from "@huxflux/ui"
import { IconBook, IconKeyboard, IconMessageCircle } from "@tabler/icons-react"
import { openExternal } from "@/lib/platform"

interface HelpPopoverProps {
  feedbackEnabled: boolean
  onFeedback: () => void
  onClose: () => void
  onShowShortcuts: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Help menu anchored to the question-mark button in the footer. Three actions:
 * send feedback (when the server enables it), open the keyboard-shortcuts
 * dialog, and open the docs site in a new tab.
 */
export function HelpPopover({ feedbackEnabled, onFeedback, onClose, onShowShortcuts, anchorRef }: HelpPopoverProps) {
  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      onClose={onClose}
      placement="top-start"
      offset={6}
      crossOffset={-8}
      className="w-52 overflow-hidden"
    >
      <div className="p-1">
        {feedbackEnabled && (
          <button
            onClick={() => { onClose(); onFeedback() }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
          >
            <IconMessageCircle size={13} className="text-muted-foreground shrink-0" />
            Send feedback
          </button>
        )}
        <button
          onClick={() => { onShowShortcuts(); onClose() }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
        >
          <IconKeyboard size={13} className="text-muted-foreground shrink-0" />
          Keyboard shortcuts
        </button>
        <button
          onClick={() => { openExternal("https://huxflux-docs.netlify.app/docs"); onClose() }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-left text-[12px] text-foreground"
        >
          <IconBook size={13} className="text-muted-foreground shrink-0" />
          Documentation
        </button>
      </div>
    </AnchoredPopover>
  )
}
