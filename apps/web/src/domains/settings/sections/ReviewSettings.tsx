import { useEffect, useRef, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { SettingRow } from "../components/SettingRow"
import { SettingInfo } from "../components/SettingInfo"
import { ReviewPromptInput } from "./ReviewPromptInput"

export function ReviewSettings() {
  const [prompt, setPrompt] = useState("")
  const [reviewModel, setReviewModel] = useState("")
  const [reviewProvider, setReviewProvider] = useState("")
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: providers = [] } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: () => api.settings.providers(),
    staleTime: 60_000,
  })

  const availableProviders = providers.filter(p => p.available)
  const selectedProvider = availableProviders.find(p => p.id === reviewProvider) ?? availableProviders[0]
  const models = selectedProvider?.models ?? []

  const { data: currentSettings } = useHuxfluxQuery({
    queryKey: queryKeys.settings.current(),
    queryFn: api.settings.current,
  })

  useEffect(() => {
    if (currentSettings) {
      // Syncing external (server-fetched) settings into local form state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrompt(currentSettings.reviewPrompt ?? "")
      setReviewModel(currentSettings.reviewModel ?? "")
      setReviewProvider(currentSettings.reviewProvider ?? "")
      setLoading(false)
    }
  }, [currentSettings])

  const updateSettings = useHuxfluxMutation<unknown, Record<string, unknown>>({
    mutationFn: (patch) => api.settings.update(patch),
    onSuccess: () => setSaved(true),
  })

  function handlePromptChange(value: string) {
    setPrompt(value)
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      updateSettings.mutate({ reviewPrompt: value })
    }, 800)
  }

  function handleProviderChange(v: string) {
    const val = v === "default" ? "" : v
    setReviewProvider(val)
    setReviewModel("")
    setSaved(false)
    updateSettings.mutate({ reviewProvider: val, reviewModel: "" })
  }

  function handleModelChange(v: string) {
    const val = v === "default" ? "" : v
    setReviewModel(val)
    setSaved(false)
    updateSettings.mutate({ reviewModel: val })
  }

  return (
    <div className="space-y-6">
      <ReviewPromptInput value={prompt} loading={loading} onChange={handlePromptChange} saved={saved} />

      <SettingRow>
        <SettingInfo label="Provider" description="Which provider to use for AI code reviews" />
        <Select value={reviewProvider || "default"} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            {availableProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow>
        <SettingInfo label="Model" description="Which model to use for AI code reviews" />
        <Select value={reviewModel || "default"} onValueChange={handleModelChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}
