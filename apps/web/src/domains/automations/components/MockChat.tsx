import { useState, useEffect, useRef } from "react"
import { getAIResponse } from "../constants"
import type { ChatMessage } from "../automations.types"
import { BuilderInput } from "./BuilderInput"

interface MockChatProps {
  onInitBuilder: (msg?: string) => void
}

export function MockChat({ onInitBuilder }: MockChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [aiTyping, setAiTyping] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aiTyping) return
    const t = window.setInterval(() => setElapsed(s => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [aiTyping])

  const handleSend = (msg: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: msg }
    setMessages(prev => [...prev, userMsg])
    setElapsed(0)
    setAiTyping(true)

    setTimeout(() => {
      const aiMsg: ChatMessage = { id: `a-${Date.now()}`, role: "ai", content: getAIResponse(msg) }
      setMessages(prev => [...prev, aiMsg])
      setAiTyping(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }, 1500 + Math.random() * 1000)

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    onInitBuilder(msg)
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss = String(elapsed % 60).padStart(2, "0")

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-10 py-8">
          <div className="mb-5 max-w-4xl">
            <p className="text-sm text-foreground leading-relaxed">
              Your automation flow has been created. You can review the pipeline on the right. Ask me to make changes, add steps, or adjust the configuration.
            </p>
          </div>

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="mb-5 ml-auto w-fit max-w-[80%] bg-card border border-border rounded-xl px-5 py-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            ) : (
              <div key={msg.id} className="mb-5 max-w-4xl">
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                <div className="flex items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] text-muted-foreground/50">1s</span>
                </div>
              </div>
            )
          )}

          {aiTyping && (
            <div className="mb-5">
              <div className="inline-flex items-center gap-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-muted-foreground/30"
                    style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.18}s infinite` }}
                  />
                ))}
                <span className="text-[11px] font-mono text-muted-foreground/40 tabular-nums ml-0.5">{mm}:{ss}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <BuilderInput onSend={handleSend} />
    </div>
  )
}
