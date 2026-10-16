import { Button, Modal, ModalActions } from "@huxflux/ui"

interface UnsavedChangesModalProps {
  path: string
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

/** Confirm closing a tab that has unsaved edits. */
export function UnsavedChangesModal({ path, onCancel, onDiscard, onSave }: UnsavedChangesModalProps) {
  return (
    <Modal onClose={onCancel} title="Unsaved changes" size="sm">
      <p className="text-[13px] text-muted-foreground">
        <span className="text-foreground font-medium">{path.split("/").pop()}</span> has changes that are not saved.
      </p>
      <ModalActions>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="outline" size="sm" onClick={onDiscard}>Discard</Button>
        <Button size="sm" onClick={onSave}>Save</Button>
      </ModalActions>
    </Modal>
  )
}
