import { useRef, useState } from "react"
import { useIsMutating } from "@tanstack/react-query"
import { toast } from "sonner"
import { generateServerIconOn, getServers, updateServer, useHuxfluxMutation, useIconGeneratorServers } from "@huxflux/shared"
import { useServers } from "@/hooks/useServers"
import { IconLoader2, IconSparkles, IconTrash, IconUpload } from "@tabler/icons-react"
import { downscaleImage, readFileAsDataUrl } from "./downscaleImage"
import { serverIconMutationKey } from "./serverAppearance"

interface IconImagePickerProps {
  // The server whose tile is being edited; its own Codex is preferred.
  serverId: string
  hasImage: boolean
  onImage: (dataUrl: string | undefined) => void
}

/**
 * Image section of the server appearance editor: upload a file, or describe
 * an icon and let Codex draw it. Any configured server with Codex installed
 * can do the drawing: the edited server first, then the active one, then any
 * other. The prompt is hidden when none has it. Every result is downscaled
 * before it is saved. Generation keeps running after the editor closes: the
 * result is written straight to the server and failures surface as a toast.
 */
export function IconImagePicker({ serverId, hasImage, onImage }: IconImagePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { servers, activeId } = useServers()
  const generators = useIconGeneratorServers(servers)
  const generator = generators.find((s) => s.id === serverId)
    ?? generators.find((s) => s.id === activeId)
    ?? generators[0]
  const mutationKey = serverIconMutationKey(serverId)
  const isDrawing = useIsMutating({ mutationKey }) > 0
  const generate = useHuxfluxMutation({
    mutationKey,
    mutationFn: (text: string) => {
      if (!generator) throw new Error("No server with Codex")
      return generateServerIconOn(generator, { description: text })
    },
    // Snapshot the look at start: a pick made while Codex draws wins.
    onMutate: () => appearanceOf(serverId),
    onSuccess: async ({ dataUrl }, _text, before) => {
      try {
        const iconImage = await downscaleImage(dataUrl)
        if (appearanceOf(serverId) !== before) return
        // Straight to the store: the editor may have closed by now.
        updateServer(serverId, { iconImage })
      } catch {
        toast.error("Codex returned an image that could not be read.")
      }
    },
    onError: () => { toast.error("Icon generation failed. Try a different description.") },
  })

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      onImage(await downscaleImage(await readFileAsDataUrl(file)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not use that image")
    }
  }

  function handleGenerate() {
    const text = description.trim()
    if (!text || isDrawing) return
    generate.mutate(text)
  }

  const actionClass = "flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"

  return (
    <div className="space-y-1.5 border-t border-border pt-2.5">
      <div className="flex items-center gap-3">
        <button onClick={() => fileRef.current?.click()} className={actionClass}>
          <IconUpload size={12} /> Upload image
        </button>
        {hasImage && (
          <button onClick={() => onImage(undefined)} className={actionClass}>
            <IconTrash size={12} /> Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = "" }}
        />
      </div>
      {generator && (
        <div className="flex gap-1.5">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleGenerate() }}
            placeholder="Describe an icon…"
            disabled={isDrawing}
            className="flex-1 min-w-0 text-[11px] bg-background border border-input rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
          />
          <button
            onClick={handleGenerate}
            disabled={isDrawing || !description.trim()}
            title={`Generate with Codex on ${generator.name}`}
            className="text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {isDrawing ? <IconLoader2 size={11} className="animate-spin" /> : <IconSparkles size={11} />}
            {isDrawing ? "Drawing…" : "Generate"}
          </button>
        </div>
      )}
      {generator && (
        <div className="text-[11px] text-muted-foreground/70">
          {isDrawing ? `Codex on ${generator.name} is drawing, this can take up to a minute.` : `Drawn by Codex on ${generator.name}`}
        </div>
      )}
      {error && <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  )
}

function appearanceOf(serverId: string): string {
  const server = getServers().find((s) => s.id === serverId)
  return `${server?.icon ?? ""}|${server?.iconImage ?? ""}`
}
