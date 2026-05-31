import type { PRFileDiff } from "../../../types.js"
import { getOctokit, parseRepo } from "./octokit.js"

/** Files changed in a PR with patches, addressed by owner/repo/number. */
export async function getPRFilesForOwnerRepo(owner: string, repo: string, prNumber: number): Promise<PRFileDiff[]> {
  const octokit = getOctokit()
  const files = await octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: prNumber, per_page: 100 })
  return files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    status: f.status as PRFileDiff["status"],
    patch: f.patch,
  }))
}

/** Files changed in a PR with patches, addressed by remote URL. */
export async function getPRFiles(repoUrl: string, prNumber: number): Promise<PRFileDiff[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner, repo, pull_number: prNumber, per_page: 100,
  })

  return files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    status: f.status as PRFileDiff["status"],
    patch: f.patch,
  }))
}

/** Raw file content from either side of a PR diff (base or head). */
export async function getPRFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filePath: string,
  side: "base" | "head",
): Promise<string> {
  const octokit = getOctokit()
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  const ref = side === "base" ? pr.base.sha : pr.head.sha
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref })
    if (Array.isArray(data) || data.type !== "file") return ""
    return Buffer.from(data.content, "base64").toString("utf8")
  } catch {
    return ""
  }
}
