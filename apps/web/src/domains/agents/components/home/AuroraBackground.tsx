/** Stacked blurred gradient bands at the top of the page. Pure decoration. */
export function AuroraBackground() {
  return (
    <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
      <div
        className="absolute inset-x-0 -top-1/3 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(96, 165, 250, 0.15) 0%, rgba(96, 165, 250, 0.04) 50%, transparent 100%)",
          animation: "homeAurora1 10s ease-in-out infinite",
          filter: "blur(50px)",
        }}
      />
      <div
        className="absolute inset-x-0 -top-1/4 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(139, 92, 246, 0.12) 0%, rgba(139, 92, 246, 0.03) 50%, transparent 100%)",
          animation: "homeAurora2 13s ease-in-out infinite",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute inset-x-0 -top-1/5 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(52, 211, 153, 0.1) 0%, rgba(52, 211, 153, 0.02) 50%, transparent 100%)",
          animation: "homeAurora3 16s ease-in-out infinite",
          filter: "blur(55px)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-full"
        style={{
          background: "linear-gradient(180deg, rgba(251, 191, 36, 0.06) 0%, transparent 40%)",
          animation: "homeAurora2 20s ease-in-out infinite reverse",
          filter: "blur(70px)",
        }}
      />
    </div>
  )
}
