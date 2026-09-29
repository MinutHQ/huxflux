import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, queryKeys, useHuxfluxQuery, type FsRepoEntry } from "@huxflux/shared"
import { c } from "@/theme"
import { LinkButton } from "../FormField"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"

/**
 * Git repos found by the server under the home directory. The search box is
 * sent to the server (debounced 300ms, like web) and also filters the current
 * result set on the device so typing feels instant.
 */
export function DiscoverList({ onSelect, onManual }: { onSelect: (r: FsRepoEntry) => void; onManual: () => void }) {
  const [search, setSearch] = useState("")
  const debounced = useDebouncedValue(search.trim(), 300)

  const { data: discovered = [], isLoading, isFetching } = useHuxfluxQuery({
    queryKey: queryKeys.repos.discover(debounced),
    queryFn: () => api.repos.findRepos(debounced || undefined),
    staleTime: 30_000,
  })

  const q = search.trim().toLowerCase()
  const filtered = q
    ? discovered.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
    : discovered

  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 10 }}>
        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search-outline" size={15} color={c.placeholder} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search repos…"
            placeholderTextColor={c.placeholder}
            style={{ flex: 1, color: c.fg, fontSize: 14, paddingVertical: 10 }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isFetching && !isLoading && <ActivityIndicator size="small" color={c.fgSub} />}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <LinkButton label="Enter path manually" onPress={onManual} />
        </View>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.accent} />
          <Text style={{ color: c.fgSub, fontSize: 13, marginTop: 10 }}>Discovering repos…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.path}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name="git-branch-outline" size={18} color={c.fgSub} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{item.name}</Text>
                <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", marginTop: 2 }} numberOfLines={1}>{item.path}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Text style={{ color: c.fgSub, fontSize: 14 }}>No repos found</Text>
              <Text style={{ color: c.placeholder, fontSize: 12, textAlign: "center" }}>
                The server scans three levels below its home directory.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </>
  )
}
