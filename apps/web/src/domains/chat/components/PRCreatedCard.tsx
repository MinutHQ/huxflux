import { IconArrowUpRight, IconGitPullRequest } from "@tabler/icons-react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { handleExternalClick } from "@/lib/platform"
import { PR_URL_RE } from "../config"

interface PRCardItemProps {
  url: string
  owner: string
  repo: string
  number: string
}

function PRCardItem({ url, owner, repo, number }: PRCardItemProps) {
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.prs.card(owner, repo, number),
    queryFn: () => api.prs.detailsForRepo(`${owner}/${repo}`, parseInt(number, 10)),
    staleTime: 5 * 60_000,
  })

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleExternalClick}
      className="block mb-3 rounded-xl border border-green-500/20 bg-green-500/5 overflow-hidden hover:border-green-500/30 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <IconGitPullRequest size={15} className="text-green-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate">
            {data?.title ?? `PR #${number}`}
          </div>
          <div className="text-[11px] text-muted-foreground/60 font-mono truncate">
            {owner}/{repo}#{number}
          </div>
        </div>
        <IconArrowUpRight size={12} className="text-muted-foreground/30 shrink-0" />
      </div>
    </a>
  )
}

export function PRCreatedCard({ content }: { content: string }) {
  const matches = [...content.matchAll(PR_URL_RE)]
  if (matches.length === 0) return null

  return (
    <>
      {matches.map((match, i) => {
        const [url, owner, repo, number] = match
        return <PRCardItem key={i} url={url} owner={owner} repo={repo} number={number} />
      })}
    </>
  )
}
