import { cn } from "@huxflux/ui"
import { FileEditor } from "./FileEditor"

type FileEditorAreaProps = React.ComponentProps<typeof FileEditor>

/** Breadcrumb over the editor for the active tab. */
export function FileEditorArea(props: FileEditorAreaProps) {
  const segments = props.path.split("/")
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 h-7 flex items-center text-[11px] text-muted-foreground truncate shrink-0">
        {segments.map((seg, i) => (
          <span key={i} className={cn(i === segments.length - 1 && "text-foreground")}>
            {i > 0 && <span className="mx-1 text-muted-foreground/50">/</span>}
            {seg}
          </span>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <FileEditor key={props.path} {...props} />
      </div>
    </div>
  )
}
