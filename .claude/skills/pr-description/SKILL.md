---
name: pr-description
description: Generate a PR description for the current branch from its commits and diff vs main, filling in the repo's PULL_REQUEST_TEMPLATE.md. Produces a ready-to-run `gh pr create` command.
---

# pr-description

The user wants to open a PR for the current branch. This skill reads the branch's commit history and diff against main, then fills in `.github/PULL_REQUEST_TEMPLATE.md` and produces a `gh pr create` command. It does NOT run the command. The user pushes and runs it.

## Arguments

None. Operates on the current branch.

## Pre-flight checks

1. Confirm the current branch is not `main`: `git rev-parse --abbrev-ref HEAD`. If it is, refuse, the user must branch first.
2. Confirm there are commits ahead of main: `git rev-list --count origin/main..HEAD`. If zero, refuse.
3. Confirm `origin/main` is fresh enough: `git fetch origin main --quiet` first if it has not been fetched this session.

## Steps

1. Read the commit list ahead of main:
   ```bash
   git log origin/main..HEAD --reverse --format='%h %s%n%b%n---'
   ```
   Capture all subjects and bodies, not just the latest.
2. Read the diff overview:
   ```bash
   git diff origin/main..HEAD --stat
   ```
   Use it to identify the areas changed (server / web / mobile / shared / scripts / docs / `.claude` / `.github`).
3. Read the full diff if the stat is short enough (under ~500 lines):
   ```bash
   git diff origin/main..HEAD
   ```
   For larger diffs, sample per-area: `git diff origin/main..HEAD -- apps/server` etc. Do not try to summarize a 5000-line diff blindly, focus on the files that materially changed (exclude lockfile, generated files, snapshot drift).
4. Read recent merged PR titles for tone reference: `gh pr list --state merged --limit 10`. Match the project's voice. If `gh` is unauthenticated, skip and rely on commit subjects.
5. Read the PR template at `.github/PULL_REQUEST_TEMPLATE.md`. Use it as the structural skeleton. The required sections are:
   - `## Summary`
   - `## Changes`
   - `## Testing`
   - `## Notes for reviewers`
6. Compose each section:
   - **Title:** mirror the convention of the dominant commit type. Format: `<type>: <imperative summary>`. 70 characters or fewer. If the branch is a single commit, the commit subject is usually the right title.
   - **Summary:** 1 to 3 sentences. Lead with user-facing impact when there is one. For structural changes say so plainly ("Restructures the agents runner into pure state plus a thin IO shell. No behavior change.").
   - **Changes:** bulleted list grouped by area when the PR spans multiple. One bullet per change unit. Reference paths when helpful. Do NOT copy the diff line by line, group related edits.
   - **Testing:** name the gates that were run and their result. Reference test files added or updated with paths. If the root CLAUDE.md "When to test" list applies and no tests exist, flag it in this section so the reviewer sees the gap.
   - **Notes for reviewers:** anything subtle, deferred follow-ups, design tradeoffs, places the diff is misleading. Write "None." if genuinely nothing applies.
7. Output the result as a fenced `gh pr create` command using HEREDOC so the body survives shell quoting:

   ```bash
   gh pr create --title "<type>: <imperative summary>" --body "$(cat <<'EOF'
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

8. Tell the user: "Push first (`git push -u origin <branch>` if needed), then run the command above. I will not push or run `gh` without your approval (see root CLAUDE.md Push Policy)."

## Style rules

- No em dashes anywhere. Use commas, periods, or parentheses.
- Concise and factual. No marketing language ("seamless", "powerful", "robust"). No hedging ("might", "should", "probably").
- Past tense for what the diff did ("Removed the legacy shim"), present tense for what the code now does ("The runner persists messages before emitting WS events").
- Reference paths in backticks. Reference functions and types in backticks too.
- The summary is read first in the PR list, make it carry weight.

## When to use this

- After the commits are landed on the feature branch and the user is about to open a PR.
- When the user says "open a PR", "PR description", "write the PR body".

## Do not

- Do not push the branch. The user controls when to push (see root CLAUDE.md Push Policy).
- Do not run `gh pr create`. Output the command, wait for approval.
- Do not invent test results or gate passes. If gates have not been run, say so plainly in the Testing section.
- Do not summarize the lockfile diff. Skip it.
- Do not invent issue or ticket references. Only include them if the user provides one.
- Do not split into too many bullets. Group by area. A 30-bullet "Changes" section is unreadable.
