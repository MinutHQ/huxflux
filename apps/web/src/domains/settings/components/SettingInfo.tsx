export function SettingInfo({ label, description }: { label: string; description?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {description && <div className="text-[13px] text-muted-foreground mt-0.5 leading-snug">{description}</div>}
    </div>
  )
}
