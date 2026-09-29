import { useQueryClient } from "@tanstack/react-query"
import {
  api, queryKeys, settingsDefaults, useHuxfluxMutation, useHuxfluxQuery, type HuxfluxSettings,
} from "@huxflux/shared"
import { useModal } from "@/ui"

type FullSettings = Required<HuxfluxSettings>

/**
 * The server-side settings blob with schema defaults filled in, plus an
 * optimistic `update`. Every settings screen reads through this so a toggle
 * flipped on one screen is already reflected on the next.
 */
export function useServerSettings() {
  const queryClient = useQueryClient()
  const modal = useModal()
  const key = queryKeys.settings.current()

  const query = useHuxfluxQuery({
    queryKey: key,
    queryFn: api.settings.current,
    staleTime: 30_000,
  })

  const mutation = useHuxfluxMutation<HuxfluxSettings, Partial<HuxfluxSettings>>({
    mutationFn: (patch) => api.settings.update(patch),
    onMutate: (patch) => {
      queryClient.setQueryData<HuxfluxSettings>(key, (old) => ({ ...(old ?? {}), ...patch }))
    },
    onError: (e) => {
      modal.showAlert("Could not save setting", e instanceof Error ? e.message : undefined)
      queryClient.invalidateQueries({ queryKey: key })
    },
    invalidate: () => key,
  })

  const settings = { ...settingsDefaults, ...(query.data ?? {}) } as FullSettings

  return {
    settings,
    loaded: query.data !== undefined,
    saving: mutation.isPending,
    update: (patch: Partial<HuxfluxSettings>) => mutation.mutate(patch),
  }
}

export type ServerSettingsState = ReturnType<typeof useServerSettings>
