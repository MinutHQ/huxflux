---
name: pr-description
description: Generate a PR description that explains WHAT is being built, WHY, and the high-level approach. Written for humans who will not read the code.
---

# pr-description

The user wants to open a PR. This skill reads the branch's commits and diff, then produces a human-readable PR description and a ready-to-run `gh pr create` command.

## Arguments

None. Operates on the current branch.

## Pre-flight

1. Confirm current branch is not `main`. If it is, refuse.
2. Confirm there are commits ahead of main: `git rev-list --count origin/main..HEAD`.
3. Fetch main if stale: `git fetch origin main --quiet`.

## Steps

1. Read commits ahead of main: `git log origin/main..HEAD --reverse --format='%h %s%n%b%n---'`.
2. Read diff overview: `git diff origin/main..HEAD --stat`.
3. Read full diff if under ~500 lines, otherwise sample by area.
4. Read `.github/PULL_REQUEST_TEMPLATE.md` for the structural skeleton.
5. Compose the description following the rules below.
6. Output as a fenced `gh pr create` command using HEREDOC.
7. Tell the user to push first, then run the command. Do NOT push or run `gh` yourself.

## Description rules

**Title:**
- Format: `<type>: <imperative summary>`
- 70 characters or fewer
- Describe the feature, fix, or change, not the code

**Summary (most important section):**
- 1 to 3 sentences
- Answer: What does this PR do? Why does it matter?
- Write for someone who will not read a single line of code
- Lead with the user-facing or system-level impact
- Good: "Users can now install the server and desktop app with a single command. The installer handles Node.js verification, PATH setup, and auto-starts the server."
- Bad: "Added cmdSetup() to cli.ts that calls installSystemService() and startServer()"

**Changes:**
- Bulleted list of what changed at a high level
- Group by area (installer, desktop app, server, etc.)
- Each bullet should describe a behavior or capability, not a file or function
- Good: "Desktop app auto-connects to the local server on first launch"
- Bad: "Added tryAutoConnectSync in autoConnect.ts, called from _app.tsx beforeLoad"

**Testing:**
- What was tested and how (manually, tests, gates)
- Flag gaps honestly

**Notes for reviewers:**
- Design tradeoffs, deferred follow-ups, anything subtle
- "None." if nothing applies

## Output format

```bash
gh pr create --title "<type>: <summary>" --body "$(cat <<'EOF'
## Summary

<summary text>

## Changes

- <bullet>
- <bullet>

## Testing

<testing text>

## Notes for reviewers

<notes text>
EOF
)"
```

## Style

- No em dashes. Use commas, periods, or parentheses.
- No code references (paths, functions, types) in Summary or Changes. Save those for Notes if truly needed.
- No marketing language ("seamless", "powerful", "robust").
- Concise and factual. The summary is read first in the PR list, make it count.

## Do not

- Do not push the branch.
- Do not run `gh pr create`. Output the command, wait for approval.
- Do not reference file paths or function names in Summary or Changes.
- Do not invent test results. If gates have not been run, say so.
- Do not summarize lockfile changes.
- Do not invent issue or ticket references.
