import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { cn } from "@huxflux/ui"
import { IconSparkles, IconSearch, IconCheck } from "@tabler/icons-react"

interface Model {
  id: string
  label: string
  provider: string
  effortLevels?: string[]
  defaultEffort?: string
}

interface Provider {
  id: string
  name?: string
}

interface ModelSelectProps {
  currentValue: string
  currentLabel: string
  models: Model[]
  providers: Provider[]
  onChange: (value: string) => void
}

const PROVIDER_ORDER = ["claude", "codex", "antigravity", "gemini", "pi"]

function providerDisplayName(id: string, providers: Provider[]): string {
  return providers.find((p) => p.id === id)?.name ?? id
}

const PI_SUB_LABELS: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", mistral: "Mistral",
  deepseek: "DeepSeek", cerebras: "Cerebras", groq: "Groq", cohere: "Cohere",
  xai: "xAI", "fireworks-ai": "Fireworks AI", togetherai: "Together AI",
  perplexity: "Perplexity", meta: "Meta", "amazon-bedrock": "Amazon Bedrock",
  azure: "Azure", nebius: "Nebius",
}

interface Section { label: string; models: Model[] }

function buildSections(models: Model[], providers: Provider[], query: string): Section[] {
  const q = query.toLowerCase().trim()
  const filtered = q
    ? models.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
    : models

  const byProvider = new Map<string, Model[]>()
  for (const m of filtered) {
    const list = byProvider.get(m.provider) ?? []
    list.push(m)
    byProvider.set(m.provider, list)
  }

  const sorted = [...byProvider.entries()].sort(
    ([a], [b]) => (PROVIDER_ORDER.indexOf(a) === -1 ? 99 : PROVIDER_ORDER.indexOf(a)) - (PROVIDER_ORDER.indexOf(b) === -1 ? 99 : PROVIDER_ORDER.indexOf(b)),
  )

  const sections: Section[] = []
  for (const [providerId, providerModels] of sorted) {
    if (providerId === "pi") {
      const bySub = new Map<string, Model[]>()
      for (const m of providerModels) {
        const slash = m.id.indexOf("/")
        const sub = slash > 0 ? m.id.slice(0, slash) : "other"
        const list = bySub.get(sub) ?? []
        list.push(m)
        bySub.set(sub, list)
      }
      for (const [sub, subModels] of bySub) {
        const subLabel = PI_SUB_LABELS[sub] ?? sub
        sections.push({ label: `Pi / ${subLabel}`, models: subModels })
      }
    } else {
      sections.push({ label: providerDisplayName(providerId, providers), models: providerModels })
    }
  }
  return sections
}

export function ModelSelect({ currentValue, currentLabel, models, providers, onChange }: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => buildSections(models, providers, query), [models, providers, query])
  const flat = useMemo(() => sections.flatMap((s) => s.models), [sections])

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setQuery(""); setSelectedIndex(0) }
  }

  const safeIndex = Math.min(selectedIndex, Math.max(flat.length - 1, 0))

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-highlighted=true]") as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [safeIndex])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false) }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, flat.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
      if (e.key === "Enter" && flat.length > 0) {
        e.preventDefault()
        const m = flat[safeIndex]
        if (m) { onChange(`${m.provider}:${m.id}`); setOpen(false) }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, flat, safeIndex, onChange])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <IconSparkles size={13} className="text-muted-foreground shrink-0" />
        <span>{currentLabel}</span>
      </button>
    )
  }

  let globalIdx = 0

  return (
    <>
      <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-foreground bg-accent transition-colors">
        <IconSparkles size={13} className="shrink-0" />
        <span>{currentLabel}</span>
      </button>
      {createPortal(
        <div className="fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-md">
            <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 border-b border-border">
                <IconSearch size={15} className="text-muted-foreground/40 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models..."
                  className="flex-1 bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                />
                <kbd className="text-[10px] text-muted-foreground/30 border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
              </div>

              <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
                {flat.length === 0 && (
                  <div className="px-4 py-8 text-center text-[13px] text-muted-foreground/40">No models found</div>
                )}
                {sections.map((section) => {
                  const items = section.models.map((m) => {
                    const idx = globalIdx++
                    const isSelected = currentValue === `${m.provider}:${m.id}`
                    return (
                      <button
                        key={`${m.provider}:${m.id}`}
                        data-highlighted={idx === safeIndex}
                        onClick={() => { onChange(`${m.provider}:${m.id}`); setOpen(false) }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                          idx === safeIndex ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className={cn("flex-1 text-[13px] truncate", isSelected ? "text-foreground font-medium" : "text-foreground/80")}>
                          {m.label}
                        </span>
                        {isSelected && <IconCheck size={13} className="text-foreground shrink-0" />}
                      </button>
                    )
                  })
                  return (
                    <div key={section.label}>
                      <div className="px-4 pt-2.5 pb-1">
                        <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{section.label}</span>
                      </div>
                      {items}
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground/30">
                <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
