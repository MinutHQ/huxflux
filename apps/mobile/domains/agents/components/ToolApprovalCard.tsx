import { useState } from "react"
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, HuxfluxApiError, useHuxfluxMutation, queryKeys, type AgentPendingApproval } from "@huxflux/shared"
import { c } from "@/theme"

function describeApprovalError(err: unknown): string {
  if (err instanceof HuxfluxApiError && err.status === 409) {
    return "This request expired or was replaced. Check the latest message from the agent."
  }
  if (err instanceof HuxfluxApiError && err.status === 404) {
    return "The agent is no longer waiting on this."
  }
  return err instanceof Error && err.message ? err.message : "Could not send the decision."
}

/**
 * Tool arguments as readable text. The shape is provider-defined and may be a
 * bare string, so fall back rather than assuming an object.
 */
function formatInput(input: unknown): string {
  if (input === null || input === undefined) return "(no arguments)"
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/**
 * The tool call the agent's turn is blocked on. Deliberately has no dismiss:
 * the agent is waiting on the decision, so closing the card locally would
 * strand it with no way back. Mount it keyed by `toolUseId` so a replacement
 * request starts clean.
 */
export function ToolApprovalCard({ agentId, pendingApproval }: {
  agentId: string
  pendingApproval: AgentPendingApproval
}) {
  const { toolUseId, toolName, input } = pendingApproval
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null)

  const decide = useHuxfluxMutation<unknown, "allow" | "deny">({
    mutationFn: (decision) => api.agents.approveTool(agentId, toolUseId, decision),
    invalidate: () => queryKeys.agents.detail(agentId),
    onError: (err) => {
      setChoice(null)
      setError(describeApprovalError(err))
    },
  })

  function send(decision: "allow" | "deny") {
    if (decide.isPending) return
    setError(null)
    setChoice(decision)
    decide.mutate(decision)
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="lock-closed-outline" size={14} color={c.fgSub} />
        <Text style={{ color: c.fg, fontSize: 13 }}>
          Allow <Text style={{ fontWeight: "700" }}>{toolName}</Text>?
        </Text>
      </View>

      <ScrollView
        style={{ maxHeight: 160, backgroundColor: c.secondary, borderRadius: 8, borderWidth: 1, borderColor: c.border }}
        contentContainerStyle={{ padding: 10 }}
      >
        <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "Menlo" }}>{formatInput(input)}</Text>
      </ScrollView>

      {error && <Text style={{ color: c.error, fontSize: 12 }}>{error}</Text>}

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <TouchableOpacity
          onPress={() => send("deny")}
          disabled={decide.isPending}
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 80, alignItems: "center",
            borderWidth: 1, borderColor: c.border, opacity: decide.isPending ? 0.5 : 1,
          }}
        >
          {decide.isPending && choice === "deny"
            ? <ActivityIndicator size="small" color={c.fgSub} />
            : <Text style={{ color: c.fgSub, fontSize: 13, fontWeight: "600" }}>Deny</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => send("allow")}
          disabled={decide.isPending}
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 80, alignItems: "center",
            backgroundColor: decide.isPending ? c.secondary : c.fgBright,
          }}
        >
          {decide.isPending && choice === "allow"
            ? <ActivityIndicator size="small" color={c.fgSub} />
            : <Text style={{ color: decide.isPending ? c.fgSub : c.fgBrightFg, fontSize: 13, fontWeight: "600" }}>Allow</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}
