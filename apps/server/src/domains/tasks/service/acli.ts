import { execFile } from "node:child_process"
import type { JiraIssue } from "./jiraClient.js"

/** Run `acli jira workitem view <key> --json --fields <fields>`. */
export function runAcliView(key: string, fields: string): Promise<JiraIssue> {
  return new Promise((resolve, reject) => {
    execFile("acli", ["jira", "workitem", "view", key, "--json", "--fields", fields], {
      timeout: 10_000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Failed to parse acli view output`))
      }
    })
  })
}

/** Run `acli jira workitem search --jql <jql> --json --limit <n>`. */
export function runAcli(jql: string, limit = 50): Promise<JiraIssue[]> {
  return new Promise((resolve, reject) => {
    execFile("acli", ["jira", "workitem", "search", "--jql", jql, "--json", "--limit", String(limit)], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Failed to parse acli output: ${stdout.slice(0, 200)}`))
      }
    })
  })
}
