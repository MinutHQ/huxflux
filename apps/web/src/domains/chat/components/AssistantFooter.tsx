import { Button, Popover, PopoverContent, PopoverTrigger } from "@huxflux/ui"
import { IconCopy } from "@tabler/icons-react"
import type { Message } from "@huxflux/shared"

function MessageMetadata({ msg }: { msg: Message }) {
  return (
    <PopoverContent align="start" className="w-56 text-xs p-3 space-y-2">
      {msg.model && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="font-medium">{msg.model}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Time</span>
        <span className="font-medium">{msg.timestamp}</span>
      </div>
      {(msg.inputTokens != null || msg.outputTokens != null) && (
        <div className="border-t pt-2 space-y-1.5">
          {msg.inputTokens != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="font-medium">{msg.inputTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.outputTokens != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium">{msg.outputTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.cacheReadTokens != null && msg.cacheReadTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache read</span>
              <span className="font-medium">{msg.cacheReadTokens.toLocaleString()}</span>
            </div>
          )}
          {msg.cacheWriteTokens != null && msg.cacheWriteTokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache write</span>
              <span className="font-medium">{msg.cacheWriteTokens.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </PopoverContent>
  )
}

export function AssistantFooter({ msg, body }: { msg: Message; body: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-2.5">
      {msg.durationMs != null && (
        <>
          <Popover>
            <PopoverTrigger className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors cursor-pointer select-none">
              {msg.durationMs < 1000 ? `${msg.durationMs}ms` : `${(msg.durationMs / 1000).toFixed(0)}s`}
            </PopoverTrigger>
            <MessageMetadata msg={msg} />
          </Popover>
          <span className="text-muted-foreground/25">·</span>
        </>
      )}
      {msg.model && (
        <>
          <span className="text-[11px] text-muted-foreground/40">{msg.model}</span>
          <span className="text-muted-foreground/25">·</span>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground/40 hover:text-muted-foreground/80"
        onClick={() => navigator.clipboard.writeText(body)}
      >
        <IconCopy size={12} />
      </Button>
    </div>
  )
}
