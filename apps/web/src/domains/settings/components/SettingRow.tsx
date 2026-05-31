import type { ReactNode } from "react"

export function SettingRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-5 border-b border-border last:border-0">
      {children}
    </div>
  )
}
