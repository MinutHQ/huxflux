import { View, Text, ScrollView, ActivityIndicator } from "react-native"
import { useQueryClient } from "@tanstack/react-query"
import { api, useAgent, queryKeys, useHuxfluxQuery, useHuxfluxMutation } from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { ThreadCard } from "../components/ThreadCard"
import { IssueCommentCard } from "../components/IssueCommentCard"
import { PRCheckRow, PRReviewRow } from "../components/PRCheckRow"
import { AgentPRHeader, AgentPRActions } from "../components/AgentPRHeader"

function PRSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  )
}

export function AgentPRPane({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient()
  const modal = useModal()
  const { data: agent } = useAgent(agentId ?? null)

  const { data: pr, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.prs.details(agentId),
    queryFn: () => api.prs.details(agentId),
    enabled: !!agentId && !!agent?.prNumber,
    staleTime: 30_000,
  })

  const markReadyMutation = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.markReady(agentId),
    invalidate: () => [queryKeys.prs.details(agentId), queryKeys.agents.detail(agentId)],
    onError: (e) => modal.showAlert("Error", e instanceof Error ? e.message : String(e)),
  })
  const rerequestMutation = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.prs.rerequestReview(agentId),
    invalidate: () => queryKeys.prs.details(agentId),
    onError: (e) => modal.showAlert("Error", e instanceof Error ? e.message : String(e)),
  })

  const handleMarkReady = () => markReadyMutation.mutate()
  const handleRerequest = () => rerequestMutation.mutate()
  const markingReady = markReadyMutation.isPending
  const rerequesting = rerequestMutation.isPending

  if (!agent?.prNumber) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.fgSub, fontSize: 14, textAlign: "center" }}>No pull request for this agent yet.</Text>
      </View>
    )
  }

  if (isLoading || !pr) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  const openThreads = pr.threads.filter((t) => !t.isResolved && t.comments.length > 0)
  const onPRUpdated = () => queryClient.invalidateQueries({ queryKey: queryKeys.prs.details(agentId) })

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <AgentPRHeader pr={pr} />
      <AgentPRActions
        pr={pr}
        markingReady={markingReady}
        rerequesting={rerequesting}
        onMarkReady={handleMarkReady}
        onRerequest={handleRerequest}
      />

      {pr.reviews.length > 0 && (
        <PRSection title="Reviews">
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            {pr.reviews.map((r, i) => (
              <PRReviewRow key={i} author={r.author} state={r.state} />
            ))}
          </View>
        </PRSection>
      )}

      {pr.checks.length > 0 && (
        <PRSection title="Checks">
          <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
            {pr.checks.map((ch, i) => (
              <PRCheckRow key={i} check={ch} />
            ))}
          </View>
        </PRSection>
      )}

      {openThreads.length > 0 && (
        <PRSection title={`Review Comments (${openThreads.length})`}>
          {openThreads.map((thread) => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              repoId={agent?.repoId ?? ""}
              prNumber={agent?.prNumber ?? 0}
              onUpdated={onPRUpdated}
            />
          ))}
        </PRSection>
      )}

      {pr.issueComments.length > 0 && (
        <PRSection title={`Discussion (${pr.issueComments.length})`}>
          {pr.issueComments.map((comment) => (
            <IssueCommentCard key={comment.id} comment={comment} />
          ))}
        </PRSection>
      )}
    </ScrollView>
  )
}
