---
name: commit
description: Generate a conventional-commit message from the current staged diff in the Huxflux style. Reads the staged changes, classifies the dominant change type, and produces a subject line plus body that matches recent commits.
---

# commit

The user has staged changes and wants a commit message. This skill produces the message only. It does NOT run `git commit` unless the user explicitly says to. See the root CLAUDE.md "Commit Policy": commits happen at the end of a session, not after every change.

## Arguments

None. The skill operates on whatever is currently staged.

## Steps

1. Read the staged diff: `git diff --cached`. If empty, refuse and tell the user to stage something first.
2. Read the staged file list: `git diff --cached --name-only`. Use it to scope where the change lives (server / web / mobile / shared / scripts / docs / `.claude` / `.github`).
3. Read recent commit messages: `git log --oneline -20` plus `git log -5 --format='%s%n%n%b'` for full bodies. Match the project's voice:
   - Subject is lowercase after the type prefix (`feat: stop leaking ...`, not `feat: Stop leaking ...`).
   - Subject is imperative ("add", "stop", "remove", not "added" or "adds").
   - Body explains WHY in 1 to 3 sentences, then a bulleted list grouped by area when the change spans multiple places.
   - No em dashes. Use commas, periods, or parentheses.
4. Classify the dominant change type from the diff. Pick exactly one:
   - `feat`: new user-visible feature or capability
   - `fix`: bug fix (behavior change that corrects a defect)
   - `refactor`: internal restructuring with no behavior change
   - `chore`: tooling, build, dependency, version bumps, non-functional
   - `docs`: documentation only (README, CLAUDE.md, comments)
   - `test`: test files only, no production code
   - When a diff mixes types, pick the dominant one and mention the others in the body. Do not invent compound prefixes.
5. Compose the subject line:
   - Format: `<type>: <imperative summary>`.
   - 72 characters or fewer including the prefix. If you cannot fit the idea, the commit is doing too much, suggest splitting.
   - No trailing period.
   - Mention the user-facing impact when the change has one. For internal changes name the system ("runner state machine", "domain registry", "lint config").
6. Compose the body:
   - One blank line after the subject.
   - 1 to 3 sentences explaining WHY. Do not restate the diff line by line, the diff already shows what changed.
   - Then a bulleted list of concrete changes, grouped by area when the diff touches multiple domains or layers. One bullet per change unit. Reference paths inline when it helps.
   - If gates were run, append a final line like `All 7 gates green.` or `Typecheck and lint green; build and test not run.` Only include this if the user has actually run them in this session.
   - Wrap body lines at ~80 characters where natural. Do not hard-wrap inside paths or commands.
   - No em dashes anywhere in subject or body.
7. Output the message in a fenced block so the user can copy it. Do NOT run `git commit` yourself. If the user then says "commit it", run:

   ```bash
   git commit -m "$(cat <<'EOF'
   <subject>

   <body>
   EOF
   )"
   ```

   Always use the HEREDOC form so multi-line bodies survive shell quoting.

## Rules baked in

- One type prefix per commit. Mixed concerns get described in the body, not the subject.
- Bodies are optional for trivial commits (typo fixes, version bumps) but encouraged for anything touching behavior, public surface, or design.
- Never include co-author tags, sign-off lines, or AI attribution. The repo policy is plain commits.
- Never reference issue numbers unless the user provides one. Do not invent them.
- The subject is what people read in `git log --oneline`. Make it carry weight.

## When to use this

- After staging changes at the end of a session.
- When the user says "commit", "make a commit", "what should this commit say".
- Before opening a PR (so the PR description skill can lean on clean commit subjects).

## Do not

- Do not run `git add`. The user controls what is staged.
- Do not run `git commit` automatically. Wait for explicit approval.
- Do not amend an existing commit unless the user explicitly says `--amend`.
- Do not skip hooks (`--no-verify`). Hooks exist for a reason.
- Do not invent a body when the change is genuinely trivial. A bare subject is fine for a typo.
