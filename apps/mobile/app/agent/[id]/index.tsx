import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  Platform, ActivityIndicator, Image, Alert,
} from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useRef, useState, useEffect, useMemo, memo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAgent, api, getActiveServer, type Message, type Agent, type AgentSummary, type ToolCall } from "@huxflux/shared"
import { WebView } from "react-native-webview"
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import { File as ExpoFile } from "expo-file-system"
import { c } from "../../../theme"
import { useModal } from "../../../components/Modal"
import FilesPane from "./files"
import PRPane from "./pr"

const MODELS = [
  { id: "claude-sonnet-4-6",        label: "Sonnet 4.6" },
  { id: "claude-opus-4-6",          label: "Opus 4.6"   },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
]

function shortModel(modelId: string) {
  return MODELS.find((m) => m.id === modelId)?.label ?? modelId.split("-").slice(-2).join(" ")
}

// ── Markdown-ish renderer ─────────────────────────────────────────────────────

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <Text style={{ color: c.fgBright, fontSize: 14, lineHeight: 21 }}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <Text key={i} style={{ color: c.fgSub, fontSize: 13 }}>`{part.slice(1, -1)}`</Text>
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
        }
        return <Text key={i}>{part}</Text>
      })}
    </Text>
  )
}

function MessageContent({ text }: { text: string }) {
  const segments = text.split(/(```[\s\S]*?```)/g)
  return (
    <View style={{ gap: 4 }}>
      {segments.map((seg, i) => {
        if (seg.startsWith("```")) {
          const firstNewline = seg.indexOf("\n")
          const lang = firstNewline > 3 ? seg.slice(3, firstNewline).trim() : ""
          const code = firstNewline > 0 ? seg.slice(firstNewline + 1, -3) : seg.slice(3, -3)
          return (
            <View key={i} style={{ backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {lang ? (
                <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }}>
                  <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }}>{lang}</Text>
                </View>
              ) : null}
              <Text style={{ color: c.fgBright, fontSize: 12, fontFamily: "monospace", lineHeight: 19, padding: 12 }}>
                {code.replace(/\n$/, "")}
              </Text>
            </View>
          )
        }
        // Parse block-level elements
        const lines = seg.split("\n")
        const elements: React.ReactNode[] = []
        let listItems: string[] = []
        let listOrdered = false

        function flushList() {
          if (listItems.length === 0) return
          elements.push(
            <View key={`list-${elements.length}`} style={{ gap: 2, paddingLeft: 4 }}>
              {listItems.map((item, li) => (
                <View key={li} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
                  <Text style={{ color: c.fgSub, fontSize: 14, lineHeight: 21, minWidth: 14 }}>
                    {listOrdered ? `${li + 1}.` : "•"}
                  </Text>
                  <InlineText text={item} />
                </View>
              ))}
            </View>
          )
          listItems = []
        }

        let paraLines: string[] = []
        function flushPara() {
          if (paraLines.length === 0) return
          const text = paraLines.map((l) => l.trim()).join(" ")
          elements.push(<InlineText key={`p-${elements.length}`} text={text} />)
          paraLines = []
        }

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li]
          if (!line.trim()) {
            flushPara()
            flushList()
            continue
          }
          const h1 = line.match(/^# (.+)/)
          const h2 = line.match(/^## (.+)/)
          const h3 = line.match(/^### (.+)/)
          const ul = line.match(/^[-*] (.+)/)
          const ol = line.match(/^\d+\. (.+)/)
          const blockquote = line.match(/^> (.+)/)
          const hr = line.match(/^---+$/)
          if (h1) {
            flushPara(); flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 18, fontWeight: "700", lineHeight: 26, marginTop: 4 }}>{h1[1]}</Text>)
          } else if (h2) {
            flushPara(); flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 4 }}>{h2[1]}</Text>)
          } else if (h3) {
            flushPara(); flushList()
            elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>{h3[1]}</Text>)
          } else if (ul) {
            flushPara()
            if (listOrdered) { flushList(); listOrdered = false }
            listItems.push(ul[1])
          } else if (ol) {
            flushPara()
            if (!listOrdered) { flushList(); listOrdered = true }
            listItems.push(ol[1])
          } else if (blockquote) {
            flushPara(); flushList()
            elements.push(
              <View key={li} style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, opacity: 0.7 }}>
                <InlineText text={blockquote[1]} />
              </View>
            )
          } else if (hr) {
            flushPara(); flushList()
            elements.push(<View key={li} style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />)
          } else {
            flushList()
            paraLines.push(line)
          }
        }
        flushPara()
        flushList()
        return elements.length > 0 ? <View key={i} style={{ gap: 6 }}>{elements}</View> : null
      })}
    </View>
  )
}

// ── Tool calls ────────────────────────────────────────────────────────────────

function ToolCallRow({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = call.result != null
  const name = call.tool === "Agent"
    ? (() => { try { return JSON.parse(call.args ?? "{}").description ?? call.tool } catch { return call.tool } })()
    : call.tool

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3 }}
    >
      <Text style={{ color: isDone ? "#34d399" : "#f59e0b", fontSize: 10, marginTop: 3 }}>
        {isDone ? "✓" : "○"}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }}>{name}</Text>
        {expanded && call.args && call.tool !== "Agent" && (
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", opacity: 0.6, marginTop: 2 }} numberOfLines={3}>
            {(() => { try { return JSON.stringify(JSON.parse(call.args), null, 2) } catch { return call.args } })()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function ToolCallsList({ calls, hasContent }: { calls: ToolCall[]; hasContent: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const COLLAPSED_MAX = 3
  const showToggle = calls.length > COLLAPSED_MAX
  const visible = expanded ? calls : calls.slice(0, COLLAPSED_MAX)
  const doneCount = calls.filter((tc) => tc.result != null).length
  const pendingCount = calls.length - doneCount

  return (
    <View style={{ marginBottom: hasContent ? 8 : 0 }}>
      {/* Summary header */}
      {showToggle && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, marginBottom: 2 }}
        >
          <Text style={{ color: c.fgSub, fontSize: 11 }}>
            {expanded ? "▾" : "▸"} {calls.length} tool calls
          </Text>
          {doneCount > 0 && <Text style={{ color: "#34d399", fontSize: 10 }}>✓{doneCount}</Text>}
          {pendingCount > 0 && <Text style={{ color: "#f59e0b", fontSize: 10 }}>○{pendingCount}</Text>}
        </TouchableOpacity>
      )}
      <View style={{ gap: 2 }}>
        {visible.map((tc) => <ToolCallRow key={tc.id} call={tc} />)}
      </View>
      {showToggle && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={{ paddingVertical: 4 }}>
          <Text style={{ color: c.link, fontSize: 11 }}>Show {calls.length - COLLAPSED_MAX} more…</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Thinking block ────────────────────────────────────────────────────────────

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = thinking.slice(0, 120).replace(/\n/g, " ")
  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.8}
      style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, marginBottom: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: c.fgSub, fontSize: 11 }}>✦</Text>
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", flex: 1 }}>Thinking</Text>
        <Text style={{ color: c.fgSub, fontSize: 10 }}>{expanded ? "▲" : "▼"}</Text>
      </View>
      {expanded ? (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 6, fontStyle: "italic" }}>
          {thinking}
        </Text>
      ) : (
        <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 18, marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>
          {preview}{thinking.length > 120 ? "…" : ""}
        </Text>
      )}
    </TouchableOpacity>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const toolCalls = message.toolCalls ?? []
  const hasContent = !!message.content

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {isUser ? (
        <View style={{ backgroundColor: c.secondary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "80%" }}>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{message.content}</Text>
        </View>
      ) : (
        <View style={{ maxWidth: "94%" }}>
          {/* Thinking block */}
          {message.thinking ? <ThinkingBlock thinking={message.thinking} /> : null}

          {/* Tool calls */}
          {toolCalls.length > 0 && (
            <ToolCallsList calls={toolCalls} hasContent={hasContent} />
          )}

          {/* Content */}
          {hasContent ? (
            <MessageContent text={message.content} />
          ) : toolCalls.length === 0 ? (
            <View style={{ flexDirection: "row", gap: 4, paddingVertical: 4 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.secondary }} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
})

// ── Team agents ──────────────────────────────────────────────────────────────

interface TeamAgent {
  id: string
  description: string
  status: "running" | "done"
  subCalls?: ToolCall[]
  outputText?: string
  result?: string
}

function extractTeamAgents(messages: Message[], isStreaming?: boolean): TeamAgent[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    const agentCalls = msg.toolCalls.filter((tc) => tc.tool === "Agent")
    if (agentCalls.length === 0) continue

    return agentCalls.map((tc) => {
      let description = "Agent"
      if (tc.args) {
        try {
          const parsed = JSON.parse(tc.args)
          description = parsed.description || parsed.prompt?.slice(0, 40) || "Agent"
        } catch {
          description = tc.args.length > 40 ? tc.args.slice(0, 40) + "…" : tc.args
        }
      }
      return {
        id: tc.id,
        description,
        status: (!isStreaming || tc.result != null) ? "done" as const : "running" as const,
        subCalls: tc.subCalls,
        outputText: tc.outputText,
        result: tc.result,
      }
    })
  }
  return []
}

function TeamAgentDetail({ agent, onClose }: { agent: TeamAgent; onClose: () => void }) {
  const output = agent.outputText || agent.result || ""
  return (
    <View style={{ maxHeight: 260, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.fg, fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>{agent.description}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={{ color: c.fgSub, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        {agent.subCalls && agent.subCalls.length > 0 && (
          <View style={{ marginBottom: 8, gap: 2 }}>
            {agent.subCalls.map((sc) => (
              <View key={sc.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
                <Text style={{ color: sc.result != null ? "#34d399" : "#f59e0b", fontSize: 9 }}>
                  {sc.result != null ? "✓" : "○"}
                </Text>
                <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={1}>
                  {sc.tool}
                </Text>
              </View>
            ))}
          </View>
        )}
        {output ? (
          <MessageContent text={output} />
        ) : (
          <Text style={{ color: c.fgSub, fontSize: 12, fontStyle: "italic" }}>No output yet</Text>
        )}
      </ScrollView>
    </View>
  )
}

function TeamBar({ agents, isStreaming }: { agents: TeamAgent[]; isStreaming?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const runningCount = agents.filter((a) => a.status === "running").length
  const doneCount = agents.filter((a) => a.status === "done").length
  const selected = agents.find((a) => a.id === selectedId) ?? null

  if (dismissed || agents.length === 0) return null

  return (
    <View>
      {/* Detail panel */}
      {selected && <TeamAgentDetail agent={selected} onClose={() => setSelectedId(null)} />}

      {/* Bar */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: "row", alignItems: "center" }}
        >
          {/* Team label */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600" }}>Team</Text>
            <Text style={{ color: c.placeholder, fontSize: 10, fontFamily: "monospace" }}>
              {runningCount > 0 ? `${runningCount} running` : ""}{runningCount > 0 && doneCount > 0 ? ", " : ""}{doneCount > 0 ? `${doneCount} done` : ""}
            </Text>
          </View>

          {/* Agent tabs */}
          {agents.map((a) => {
            const isSelected = selectedId === a.id
            const isDone = a.status === "done"
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => setSelectedId(isSelected ? null : a.id)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                  backgroundColor: isSelected ? c.secondary : "transparent",
                  borderWidth: 1, borderColor: isSelected ? c.border : "transparent",
                }}
              >
                <Text style={{ color: isDone ? "#34d399" : "#f59e0b", fontSize: 9 }}>{isDone ? "✓" : "●"}</Text>
                <Text style={{ color: isSelected ? c.fg : c.fgSub, fontSize: 11, fontWeight: "500" }} numberOfLines={1}>
                  {a.description}
                </Text>
              </TouchableOpacity>
            )
          })}

          {/* Dismiss */}
          <TouchableOpacity onPress={() => setDismissed(true)} style={{ paddingHorizontal: 6 }}>
            <Text style={{ color: c.placeholder, fontSize: 12 }}>✕</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  )
}

// ── Inline terminal pane (xterm.js via WebView) ─────────────────────────────

function buildTerminalHtml(wsUrl: string) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { height:100%; overflow:hidden; background:#0d0d0d; }
  #terminal { height:100%; }
  .xterm { height:100%; padding:4px; }
  .xterm-viewport::-webkit-scrollbar { width:6px; }
  .xterm-viewport::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:3px; }
</style>
</head><body>
<div id="terminal"></div>
<script>
  const term = new window.Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Menlo, "Courier New", monospace',
    lineHeight: 1.2,
    theme: {
      background: '#0d0d0d',
      foreground: '#e4e4e7',
      cursor: '#e4e4e7',
      selectionBackground: 'rgba(99,102,241,0.3)',
      black: '#1c1917', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
      blue: '#60a5fa', magenta: '#a78bfa', cyan: '#22d3ee', white: '#e7e5e4',
      brightBlack: '#57534e', brightRed: '#fca5a5', brightGreen: '#6ee7b7',
      brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9', brightWhite: '#fafaf9',
    },
  });
  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new window.WebLinksAddon.WebLinksAddon());
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  let ws;
  function connect() {
    ws = new WebSocket(${JSON.stringify(wsUrl)});
    ws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      if (dims) ws.send(JSON.stringify({ type:'resize', cols:dims.cols, rows:dims.rows }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'output') term.write(msg.data);
        else if (msg.type === 'error') term.writeln('\\r\\n\\x1b[31m' + msg.message + '\\x1b[0m');
        else if (msg.type === 'exit') term.writeln('\\r\\n\\x1b[2m[exited ' + msg.exitCode + ']\\x1b[0m');
      } catch {}
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  connect();

  term.onData((data) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type:'input', data }));
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims && ws && ws.readyState === 1) ws.send(JSON.stringify({ type:'resize', cols:dims.cols, rows:dims.rows }));
  });

  new ResizeObserver(() => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims && ws && ws.readyState === 1) ws.send(JSON.stringify({ type:'resize', cols:dims.cols, rows:dims.rows }));
  }).observe(document.getElementById('terminal'));
</script>
</body></html>`
}

function TerminalPane({ agentId }: { agentId: string }) {
  const { data: tabs = [] } = useQuery<{ id: string; terminalId: string; label: string | null; orderIdx: number }[]>({
    queryKey: ["terminal-tabs", agentId],
    queryFn: () => api.getTerminalTabs(agentId),
    enabled: !!agentId,
    staleTime: 15_000,
  })

  const [activeTermTab, setActiveTermTab] = useState<string | null>(null)

  useEffect(() => {
    if (tabs.length > 0 && !activeTermTab) setActiveTermTab(tabs[0].id)
  }, [tabs])

  const activeTerminal = tabs.find((t) => t.id === activeTermTab)
  const terminalId = activeTerminal?.terminalId ?? "t1"

  const server = getActiveServer()
  const base = server?.url ?? "http://localhost:4321"
  const wsBase = base.replace(/^http/, "ws")
  const wsUrl = `${wsBase}/ws/pty/${agentId}?terminalId=${encodeURIComponent(terminalId)}&fresh=1${server?.token ? `&token=${server.token}` : ""}`

  const html = useMemo(() => buildTerminalHtml(wsUrl), [wsUrl])

  return (
    <View style={{ flex: 1 }}>
      {/* Terminal tabs */}
      {tabs.length > 1 && (
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 12, paddingVertical: 6, gap: 4 }}>
          {tabs
            .sort((a, b) => a.orderIdx - b.orderIdx)
            .map((tab) => {
              const isActive = tab.id === activeTermTab
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTermTab(tab.id)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                    backgroundColor: isActive ? c.secondary : "transparent",
                  }}
                >
                  <Text style={{ color: isActive ? c.fg : c.fgSub, fontSize: 12, fontWeight: isActive ? "600" : "400" }}>
                    {tab.label || `Terminal ${tab.orderIdx + 1}`}
                  </Text>
                </TouchableOpacity>
              )
            })}
        </View>
      )}

      {/* xterm.js WebView */}
      <WebView
        key={wsUrl}
        source={{ html }}
        style={{ flex: 1, backgroundColor: "#0d0d0d" }}
        javaScriptEnabled
        originWhitelist={["*"]}
        scrollEnabled={false}
      />
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const modal = useModal()
  const insets = useSafeAreaInsets()

  // Active session — starts as the root agent, can switch to child sessions
  const [activeSessionId, setActiveSessionId] = useState<string | null>(id ?? null)
  const [creatingSession, setCreatingSession] = useState(false)

  // Reset active session when navigating to a different agent
  useEffect(() => { setActiveSessionId(id ?? null) }, [id])

  // Fetch child sessions for this agent
  const { data: sessions = [], refetch: refetchSessions } = useQuery<AgentSummary[]>({
    queryKey: ["agent-sessions", id],
    queryFn: () => api.getAgentSessions(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const { data: agent, isLoading, isError, refetch, isStreaming, loadMore, hasMore, isLoadingMore } = useAgent(activeSessionId)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [planMode, setPlanMode] = useState(false)
  const [attachments, setAttachments] = useState<{ name: string; path: string; mimeType: string; localUri: string }[]>([])
  const [activeTab, setActiveTab] = useState<"chat" | "files" | "pr" | "terminal">("chat")
  // Reset to chat when switching agents
  useEffect(() => { setActiveTab("chat") }, [id])
  const listRef = useRef<FlatList>(null)
  const isAtBottom = useRef(true)

  // Deduplicate by ID — prevents FlatList key errors when setQueryData (streaming)
  // and invalidateQueries (refetch) briefly produce the same ID twice
  const messages = useMemo(() => {
    const seen = new Set<string>()
    return (agent?.messages ?? []).filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [agent?.messages])

  const teamAgents = useMemo(() => extractTeamAgents(messages, isStreaming), [messages, isStreaming])

  // Track streaming content length so we can auto-scroll during streaming
  const lastMessage = messages[messages.length - 1]
  const streamingContentLen = lastMessage?.content?.length ?? 0
  const streamingToolCallsLen = lastMessage?.toolCalls?.length ?? 0

  // Scroll to bottom when new messages arrive, content streams, or streaming ends
  useEffect(() => {
    if (messages.length > 0 && isAtBottom.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [messages.length, streamingContentLen, streamingToolCallsLen, isStreaming])

  // Auto-send queued message when streaming ends
  useEffect(() => {
    if (!isStreaming && queuedMessage !== null) {
      const msg = queuedMessage
      setQueuedMessage(null)
      doSend(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  async function createSession() {
    if (!agent || creatingSession) return
    setCreatingSession(true)
    try {
      const created = await api.createAgent({
        title: "Untitled",
        branch: agent.branch,
        model: agent.model,
        shareWorktreeWith: id!,  // always share with root agent
      })
      queryClient.setQueryData(["agent", created.id], {
        ...created,
        messages: created.messages ?? [],
        fileChanges: created.fileChanges ?? [],
        terminalOutput: created.terminalOutput ?? [],
      })
      queryClient.invalidateQueries({ queryKey: ["agent-sessions", id] })
      setActiveSessionId(created.id)
    } catch {
      modal.showAlert("Error", "Failed to create session")
    } finally {
      setCreatingSession(false)
    }
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to attach images.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
    })
    if (result.canceled || !result.assets.length) return
    for (const asset of result.assets) {
      try {
        const file = new ExpoFile(asset.uri)
        const base64 = await file.base64()
        const mimeType = asset.mimeType ?? "image/jpeg"
        const name = asset.fileName ?? `image-${Date.now()}.jpg`
        const dataUrl = `data:${mimeType};base64,${base64}`
        const uploaded = await api.uploadFile(activeSessionId!, name, dataUrl, mimeType)
        setAttachments((prev) => [...prev, { ...uploaded, localUri: asset.uri }])
      } catch {
        Alert.alert("Upload failed", "Could not upload the selected image.")
      }
    }
  }

  function handleModelPress() {
    modal.showActionSheet("Select model", MODELS.map((m) => ({
      label: m.label,
      onPress: () => {
        if (agent) {
          ;(api.updateAgent as any)(agent.id, { model: m.id })
          queryClient.setQueryData<Agent>(["agent", agent.id], (old) => old ? { ...old, model: m.id } : old)
        }
      },
    })))
  }

  async function doSend(content: string) {
    if (!activeSessionId || !content.trim()) return
    setSending(true)
    const optimisticId = `optimistic-${Date.now()}`
    queryClient.setQueryData<Agent>(["agent", activeSessionId], (old) => {
      if (!old) return old
      return {
        ...old,
        messages: [
          ...old.messages,
          { id: optimisticId, role: "user", content, timestamp: new Date().toISOString() },
        ],
      }
    })
    try {
      await api.sendMessage(activeSessionId, content)
    } catch {
      queryClient.setQueryData<Agent>(["agent", activeSessionId], (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticId) }
      })
    } finally {
      setSending(false)
    }
  }

  function buildContent(text: string) {
    if (attachments.length === 0) return text
    const fileBlock = attachments.map((f) => `- ${f.name}: ${f.path}`).join("\n")
    return `Attached files:\n${fileBlock}\n\n---\n\n${text}`
  }

  function handleSend() {
    const text = input.trim()
    if ((!text && attachments.length === 0) || !id || sending) return
    const content = buildContent(text)
    setInput("")
    setAttachments([])
    if (isStreaming) {
      setQueuedMessage(content)
      return
    }
    doSend(content)
  }

  if (isError && !agent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Text style={{ color: c.fgSub, fontSize: 14 }}>Could not load agent</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: c.secondary }}
        >
          <Text style={{ color: c.fg, fontSize: 14 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (isLoading || !agent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + (Platform.OS === "ios" ? 44 : 56)}
    >
      {/* Sessions strip — shown when there are (or could be) multiple sessions */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center" }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 4, paddingVertical: 6, flexDirection: "row" }}>
          {/* Root session tab */}
          <TouchableOpacity
            onPress={() => setActiveSessionId(id ?? null)}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
              backgroundColor: activeSessionId === id ? c.secondary : "transparent",
            }}
          >
            <Text style={{ color: activeSessionId === id ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
              {agent?.title ?? "Session 1"}
            </Text>
          </TouchableOpacity>
          {/* Child session tabs */}
          {sessions.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => {
                // Pre-fill cache if not already there
                queryClient.setQueryData(["agent", s.id], (old: Agent | undefined) =>
                  old ?? { ...s, messages: [], fileChanges: [], terminalOutput: [] }
                )
                setActiveSessionId(s.id)
              }}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                backgroundColor: activeSessionId === s.id ? c.secondary : "transparent",
              }}
            >
              <Text style={{ color: activeSessionId === s.id ? c.fg : c.fgSub, fontSize: 12, fontWeight: "500" }}>
                {s.title === "Untitled" ? `Session ${i + 2}` : s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* New session button */}
        <TouchableOpacity
          onPress={createSession}
          disabled={creatingSession}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          {creatingSession
            ? <ActivityIndicator size="small" color={c.fgSub} />
            : <Text style={{ color: c.fgSub, fontSize: 18, lineHeight: 20 }}>+</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Sub-nav */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16, gap: 4, paddingTop: 4 }}>
        {([
          { label: "Chat", tab: "chat" as const },
          { label: `Files${agent.fileChanges.length ? ` (${agent.fileChanges.length})` : ""}`, tab: "files" as const },
          { label: "PR", tab: "pr" as const },
          { label: "Terminal", tab: "terminal" as const },
        ]).map(({ label, tab }) => (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              setActiveTab(tab)
              if (tab === "chat") setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50)
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: activeTab === tab ? 2 : 0, borderBottomColor: c.fg }}
          >
            <Text style={{ color: activeTab === tab ? c.fg : c.fgSub, fontSize: 13, fontWeight: activeTab === tab ? "600" : "400" }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
      </View>

      {activeTab === "chat" && (
        <>
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
            onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
              const dist = contentSize.height - contentOffset.y - layoutMeasurement.height
              isAtBottom.current = dist < 80
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={hasMore ? (
              <TouchableOpacity
                onPress={loadMore}
                disabled={isLoadingMore}
                style={{ alignItems: "center", paddingVertical: 12 }}
              >
                {isLoadingMore
                  ? <ActivityIndicator size="small" color={c.fgSub} />
                  : <Text style={{ color: c.link, fontSize: 13 }}>Load earlier messages</Text>
                }
              </TouchableOpacity>
            ) : null}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                <Text style={{ color: c.fgSub, fontSize: 14 }}>Start the conversation</Text>
              </View>
            }
            ListFooterComponent={null}
          />
          {teamAgents.length > 1 && <TeamBar agents={teamAgents} isStreaming={isStreaming} />}
        </>
      )}
      {activeTab === "files" && <FilesPane />}
      {activeTab === "pr" && <PRPane />}
      {activeTab === "terminal" && <TerminalPane agentId={id!} />}

      {/* Input bar — chat only */}
      {activeTab === "chat" && <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
        {/* Queued message preview */}
        {queuedMessage && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ color: c.fgSub, fontSize: 11, flex: 1 }} numberOfLines={1}>
              ⏱ Queued: {queuedMessage}
            </Text>
            <TouchableOpacity onPress={() => setQueuedMessage(null)}>
              <Text style={{ color: c.fgSub, fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
            {attachments.map((f) => (
              <View key={f.path} style={{ position: "relative" }}>
                {f.mimeType.startsWith("image/") ? (
                  <Image source={{ uri: f.localUri }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.card }} />
                ) : (
                  <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-outline" size={24} color={c.fgSub} />
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setAttachments((prev) => prev.filter((a) => a.path !== f.path))}
                  style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: c.fg, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: c.bg, fontSize: 11, fontWeight: "700", lineHeight: 13 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={isStreaming ? (queuedMessage ? "Replace queued message…" : "Queue a follow-up…") : messages.length === 0 ? "Tell the agent what to work on…" : "Add a follow up"}
            placeholderTextColor={c.placeholder}
            multiline
            style={{
              color: c.fg,
              fontSize: 14,
              lineHeight: 20,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              maxHeight: 120,
            }}
          />
          {/* Bottom toolbar */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
            {/* Attach image */}
            <TouchableOpacity
              onPress={pickImage}
              style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}
            >
              <Ionicons name="image-outline" size={16} color={c.fgSub} />
            </TouchableOpacity>

            {/* Model selector */}
            <TouchableOpacity
              onPress={handleModelPress}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
            >
              <Text style={{ color: c.fgSub, fontSize: 11 }}>✦</Text>
              <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "500" }}>{shortModel(agent.model)}</Text>
              <Text style={{ color: c.placeholder, fontSize: 9 }}>▾</Text>
            </TouchableOpacity>

            {/* Thinking toggle */}
            <TouchableOpacity
              onPress={() => setThinking((v) => !v)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                backgroundColor: thinking ? c.secondary : "transparent",
              }}
            >
              <Ionicons name="bulb-outline" size={13} color={thinking ? "#fff" : c.fgSub} />
              <Text style={{ color: thinking ? "#fff" : c.fgSub, fontSize: 11, fontWeight: "500" }}>Thinking</Text>
            </TouchableOpacity>

            {/* Plan toggle */}
            <TouchableOpacity
              onPress={() => setPlanMode((v) => !v)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                backgroundColor: planMode ? c.secondary : "transparent",
              }}
            >
              <Ionicons name="map-outline" size={13} color={planMode ? "#fff" : c.fgSub} />
              <Text style={{ color: planMode ? "#fff" : c.fgSub, fontSize: 11, fontWeight: "500" }}>Plan</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Stop / send */}
            {isStreaming && !queuedMessage ? (
              <TouchableOpacity
                onPress={() => api.stopAgent(activeSessionId!).catch(() => {})}
                style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>■</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={(!input.trim() && attachments.length === 0) || sending}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  backgroundColor: (input.trim() || attachments.length > 0) && !sending ? c.fgBright : c.secondary,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {sending
                  ? <ActivityIndicator size="small" color={c.fgSub} />
                  : <Text style={{ color: (input.trim() || attachments.length > 0) ? c.bg : c.fgSub, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>↑</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>}
    </KeyboardAvoidingView>
  )
}
