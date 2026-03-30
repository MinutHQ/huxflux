import { Octokit } from "@octokit/rest"
import { config } from "../config.js"

function getOctokit() {
  return new Octokit({ auth: config.githubToken || undefined })
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  // Handle formats: "owner/repo", "https://github.com/owner/repo", "git@github.com:owner/repo.git"
  const match =
    repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/) ??
    repoUrl.match(/^([^/]+)\/([^/]+)$/)
  if (!match) throw new Error(`Cannot parse repo URL: ${repoUrl}`)
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") }
}

export async function createPR(params: {
  repoUrl: string
  branch: string
  baseBranch: string
  title: string
  body?: string
}): Promise<{ url: string; number: number }> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(params.repoUrl)
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    head: params.branch,
    base: params.baseBranch,
    title: params.title,
    body: params.body ?? "",
  })
  return { url: data.html_url, number: data.number }
}

export async function getPRStatus(repoUrl: string, prNumber: number) {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
  return {
    state: data.state,
    mergeable: data.mergeable,
    draft: data.draft,
    url: data.html_url,
  }
}

export async function listBranches(repoUrl: string): Promise<string[]> {
  const octokit = getOctokit()
  const { owner, repo } = parseRepo(repoUrl)
  const { data } = await octokit.repos.listBranches({ owner, repo, per_page: 100 })
  return data.map((b) => b.name)
}
