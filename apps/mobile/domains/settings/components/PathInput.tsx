import { useState } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"
import { TextField } from "./FormField"
import { useDebouncedValue } from "../hooks/useDebouncedValue"

/**
 * Path field with directory suggestions from the server (`GET /api/fs/browse`).
 * Mirrors the web PathInput: browse the directory up to the last slash, filter
 * entries by the partial last segment, show at most 10.
 */
export function PathInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false)
  const debounced = useDebouncedValue(value, 250)
  const lastSlash = debounced.lastIndexOf("/")
  const browseDir = lastSlash >= 0 ? debounced.slice(0, lastSlash + 1) : debounced

  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.repos.browse(browseDir),
    queryFn: () => api.repos.browseFs(browseDir || undefined),
    enabled: focused,
    staleTime: 30_000,
  })

  const lastSegment = value.split("/").pop()?.toLowerCase() ?? ""
  const suggestions = (data?.dirs ?? [])
    .filter((d) => !lastSegment || d.name.toLowerCase().startsWith(lastSegment))
    .filter((d) => d.path !== value)
    .slice(0, 10)

  return (
    <View>
      <TextField
        label={label}
        mono
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {focused && suggestions.length > 0 && (
        <View style={{ marginTop: 6, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, overflow: "hidden" }}>
          {suggestions.map((d) => (
            <TouchableOpacity
              key={d.path}
              onPress={() => onChange(d.path)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}
            >
              <Ionicons name="folder-outline" size={14} color={c.fgSub} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.fg, fontSize: 13 }} numberOfLines={1}>{d.name}</Text>
                <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={1}>{d.path}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}
