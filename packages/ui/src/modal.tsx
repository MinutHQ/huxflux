"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { IconX } from "@tabler/icons-react"
import { cn } from "./utils"

type ModalSize = "sm" | "md" | "lg" | "xl"

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
}

interface BaseModalProps {
  onClose: () => void
  title: React.ReactNode
  /** Tailwind max-width preset. Default "md". */
  size?: ModalSize
  /** Optional node placed before the close X (e.g. a settings button). */
  headerActions?: React.ReactNode
  /** Extra classes on the modal card. */
  className?: string
  children: React.ReactNode
}

interface ModalAsFormProps extends BaseModalProps {
  asForm: true
  onSubmit: React.FormEventHandler<HTMLFormElement>
}

interface ModalAsDivProps extends BaseModalProps {
  asForm?: false
  onSubmit?: never
}

export type ModalProps = ModalAsFormProps | ModalAsDivProps

/**
 * Centered overlay dialog. Renders into `document.body`, dims the rest of the
 * app with a backdrop, and closes on backdrop click or Escape. Pass
 * `asForm onSubmit={...}` to wrap the content in a `<form>`.
 */
export function Modal({
  onClose,
  title,
  size = "md",
  headerActions,
  asForm,
  onSubmit,
  className,
  children,
}: ModalProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const cardClassName = cn(
    "relative z-10 w-full bg-card border border-border rounded-xl shadow-2xl p-5",
    sizeClasses[size],
    className,
  )

  const header = (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex items-center gap-1">
        {headerActions}
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <IconX size={15} />
        </button>
      </div>
    </div>
  )

  const body = asForm ? (
    <form onSubmit={onSubmit} className={cardClassName}>
      {header}
      {children}
    </form>
  ) : (
    <div className={cardClassName}>
      {header}
      {children}
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      {body}
    </div>,
    document.body,
  )
}

/** Right-aligned button row for modal footers. */
export function ModalActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex justify-end gap-2 mt-5", className)}>{children}</div>
}
