import { View, Text, TouchableOpacity } from "react-native"
import { useState, useEffect, useMemo } from "react"
import { WebView } from "react-native-webview"
import { api, getActiveServer, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"

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

interface TerminalTab {
  id: string
  terminalId: string
  label: string | null
  orderIdx: number
}

export function TerminalPane({ agentId }: { agentId: string }) {
  const { data: tabs = [] } = useHuxfluxQuery<TerminalTab[]>({
    queryKey: queryKeys.agents.terminalTabs(agentId),
    queryFn: () => api.agents.terminalTabs(agentId),
    enabled: !!agentId,
    staleTime: 15_000,
  })

  const [activeTermTab, setActiveTermTab] = useState<string | null>(null)

  useEffect(() => {
    // Pick the first tab once data arrives. Syncing external (server) state into
    // local UI selection — the effect is the right place for this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabs.length > 0 && !activeTermTab) setActiveTermTab(tabs[0].id)
  }, [tabs, activeTermTab])

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
