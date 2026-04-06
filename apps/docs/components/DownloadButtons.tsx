"use client"

const RELEASES_PAGE = "https://github.com/AlexMartosP/huxflux-releases/releases/latest"

export function DownloadButtons() {
  return (
    <div className="not-prose my-6 flex flex-col items-start gap-3">
      <a
        href={RELEASES_PAGE}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white no-underline transition-opacity hover:opacity-85 dark:bg-neutral-700"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download for Desktop
      </a>
      <p className="text-xs text-fd-muted-foreground">
        macOS · Linux · Available as .dmg, .AppImage, and .deb
      </p>
    </div>
  )
}
