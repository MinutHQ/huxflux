import { useState } from "react"
import { Button, Modal } from "@huxflux/ui"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { IconMessageCircle, IconExternalLink } from "@tabler/icons-react"
import { toast } from "sonner"
import { handleExternalClick } from "@/lib/platform"

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [submitted, setSubmitted] = useState<{ url: string; number: number } | null>(null)

  const submitFeedback = useHuxfluxMutation<{ url: string; number: number }, { title: string; body?: string }>({
    mutationFn: (input) => api.settings.submitFeedback(input),
    onSuccess: (result) => setSubmitted(result),
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to submit feedback"
      toast.error(message)
    },
  })
  const submitting = submitFeedback.isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || submitting) return
    submitFeedback.mutate({ title: title.trim(), body: body.trim() || undefined })
  }

  const titleNode = (
    <span className="flex items-center gap-2">
      <IconMessageCircle size={15} className="text-muted-foreground" />
      <span>Send feedback</span>
    </span>
  )

  return (
    <Modal title={titleNode} onClose={onClose}>
      {submitted ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Thanks for the feedback! Your issue has been created.
          </p>
          <a
            href={submitted.url}
            target="_blank"
            rel="noreferrer"
            onClick={handleExternalClick}
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
    </Modal>
  )
}
