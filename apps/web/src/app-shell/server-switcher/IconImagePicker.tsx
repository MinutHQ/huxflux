import { useRef, useState } from "react"
import { generateServerIconOn, useHuxfluxMutation, useIconGeneratorServers } from "@huxflux/shared"
import { useServers } from "@/hooks/useServers"
import { IconLoader2, IconSparkles, IconTrash, IconUpload } from "@tabler/icons-react"
import { downscaleImage, readFileAsDataUrl } from "./downscaleImage"

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
 * before it is saved.
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
  const generate = useHuxfluxMutation({
    mutationFn: (text: string) => {
      if (!generator) throw new Error("No server with Codex")
      return generateServerIconOn(generator, { description: text })
    },
    onSuccess: async ({ dataUrl }) => {
      try {
        onImage(await downscaleImage(dataUrl))
      } catch {
        setError("Codex returned an image that could not be read.")
      }
    },
    onError: () => setError("Generation failed. Try a different description."),
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
    if (!text || generate.isPending) return
    setError(null)
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
            disabled={generate.isPending}
            className="flex-1 min-w-0 text-[11px] bg-background border border-input rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
          />
          <button
            onClick={handleGenerate}
            disabled={generate.isPending || !description.trim()}
            title={`Generate with Codex on ${generator.name}`}
            className="text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {generate.isPending ? <IconLoader2 size={11} className="animate-spin" /> : <IconSparkles size={11} />}
            {generate.isPending ? "Drawing…" : "Generate"}
          </button>
        </div>
      )}
      {generator && (
        <div className="text-[11px] text-muted-foreground/70">
          {generate.isPending ? `Codex on ${generator.name} is drawing, this can take up to a minute.` : `Drawn by Codex on ${generator.name}`}
        </div>
      )}
      {error && <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  )
}
