import { useState } from "react"
import type { EditorView } from "@codemirror/view"
import { Button } from "@huxflux/ui"
import { IconFileUnknown } from "@tabler/icons-react"
import { api, getMediaType, queryKeys, useHuxfluxQuery, type PRComment } from "@huxflux/shared"
import { useFileBuffer } from "../../hooks/useFileBuffer"
import type { FileBuffer } from "../../file-changes.types"
import { CodeEditor } from "./CodeEditor"
import { MediaPreview } from "./MediaPreview"

interface FileEditorProps {
  agentId: string
  path: string
  jump?: { line: number; nonce: number }
  restored: FileBuffer | undefined
  onBufferChange: (path: string, buffer: FileBuffer) => void
  comments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
  onView?: (view: EditorView | null) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Shows one worktree file: images, video and audio as media previews,
 * everything else in the text editor.
 */
export function FileEditor(props: FileEditorProps) {
  const media = getMediaType(props.path)
  if (media) return <MediaPreview agentId={props.agentId} path={props.path} kind={media.kind} />
  return <TextFileEditor {...props} />
}

/**
 * Loads one worktree file and shows it in the editor. Binary and very large
 * files get a placeholder with "View as text anyway"; a forced binary view is
 * read-only so a save cannot corrupt the file.
 */
function TextFileEditor({ agentId, path, jump, restored, onBufferChange, comments, onAddComment, onRemoveComment, onView }: FileEditorProps) {
  const [force, setForce] = useState(false)
  const { data, isLoading, error } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileRead(agentId, path, force),
    queryFn: () => api.agents.readFile(agentId, path, force),
    staleTime: 2_000,
    retry: false,
  })

  const buffer = useFileBuffer({ agentId, path, force, disk: data?.content ?? null, restored, onBufferChange })

  if (error) {
    return <Placeholder title="Could not open this file" detail={error.message} />
  }
  if (isLoading || !data) {
    return <p className="p-4 text-[12px] text-muted-foreground">Loading...</p>
  }
  if (data.content === null) {
    return (
      <Placeholder
        title={data.binary ? "This file looks like binary data and can't be previewed as text" : `This file is too large to preview (${formatSize(data.size)})`}
        action={<Button variant="outline" size="xs" onClick={() => setForce(true)}>View as text anyway</Button>}
      />
    )
  }
  return (
    <CodeEditor
      path={path}
      buffer={buffer}
      readOnly={data.binary}
      jump={jump}
      comments={comments}
      onAddComment={onAddComment}
      onRemoveComment={onRemoveComment}
      onView={onView}
    />
  )
}

function Placeholder({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <IconFileUnknown size={22} className="text-muted-foreground/60" />
      <p className="text-[12px] text-foreground max-w-xs">{title}</p>
      {detail && <p className="text-[11px] text-muted-foreground max-w-xs">{detail}</p>}
      {action}
    </div>
  )
}
