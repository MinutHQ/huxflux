import { Dialog as RadixDialog } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "./utils"

function Dialog(props: ComponentProps<typeof RadixDialog.Root>) {
  return <RadixDialog.Root {...props} />
}

function DialogTrigger(props: ComponentProps<typeof RadixDialog.Trigger>) {
  return <RadixDialog.Trigger {...props} />
}

function DialogPortal(props: ComponentProps<typeof RadixDialog.Portal>) {
  return <RadixDialog.Portal {...props} />
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof RadixDialog.Overlay>) {
  return (
    <RadixDialog.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({ className, children, ...props }: ComponentProps<typeof RadixDialog.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <RadixDialog.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-[50%] top-[15%] z-50 w-full max-w-xl translate-x-[-50%] rounded-xl bg-card border border-border/40 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2",
          className,
        )}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </DialogPortal>
  )
}

function DialogClose({ className, ...props }: ComponentProps<typeof RadixDialog.Close>) {
  return <RadixDialog.Close className={className} {...props} />
}

function DialogTitle({ className, ...props }: ComponentProps<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title
      data-slot="dialog-title"
      className={cn("text-[12px] text-muted-foreground/50", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
