import { useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@huxflux/ui"
import { api } from "@huxflux/shared"
import { IconX, IconMessageCircle, IconExternalLink } from "@tabler/icons-react"
import { toast } from "sonner"

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ url: string; number: number } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      const result = await api.submitFeedback({ title: title.trim(), body: body.trim() || undefined })
      setSubmitted(result)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <IconMessageCircle size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Send feedback</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <IconX size={15} />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Thanks for the feedback! Your issue has been created.
            </p>
            <a
              href={submitted.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-foreground hover:underline"
            >
              <IconExternalLink size={13} />
              View issue #{submitted.number}
            </a>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of your feedback"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Details <span className="text-muted-foreground/50">(optional)</span></label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Steps to reproduce, expected vs actual behavior, etc."
                rows={4}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={!title.trim() || submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
