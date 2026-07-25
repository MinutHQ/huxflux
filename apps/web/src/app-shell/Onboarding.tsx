import { useState } from "react"
import { IconServer } from "@tabler/icons-react"
import { OnboardingDirectConnect } from "./OnboardingDirectConnect"
import { OnboardingProxyConnect } from "./OnboardingProxyConnect"

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [mode, setMode] = useState<"direct" | "proxy">("direct")

  const tabClass = (active: boolean) =>
    `pb-1 transition-colors ${active ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"}`

  return (
    <div className="flex h-screen bg-background text-foreground items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <IconServer size={22} className="text-primary" />
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-foreground mb-2">Connect to your server</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {mode === "direct"
              ? <>Paste the connection string from <code className="font-mono text-foreground/80">huxflux status</code>, or enter a URL manually.</>
              : <>Enter your proxy URL and sign in to reach a server over the Internet.</>}
          </p>
        </div>

        <div className="flex justify-center gap-4 text-[12px] mb-6">
          <button type="button" onClick={() => setMode("direct")} className={tabClass(mode === "direct")}>Direct</button>
          <button type="button" onClick={() => setMode("proxy")} className={tabClass(mode === "proxy")}>Via proxy</button>
        </div>

        {mode === "proxy"
          ? <OnboardingProxyConnect onComplete={onComplete} />
          : <OnboardingDirectConnect onComplete={onComplete} />}
      </div>
    </div>
  )
}
