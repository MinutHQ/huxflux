---
name: commit
description: Generate a commit message that explains WHAT changed and WHY in plain language. No code references. Humans read these, not machines.
---

# commit

The user has staged changes and wants a commit message. This skill reads the diff and produces a message that a human can understand without looking at the code.

## Arguments

None. Operates on whatever is currently staged.

## Steps

1. Read the staged diff: `git diff --cached`. If empty, refuse and tell the user to stage something first.
2. Read the staged file list: `git diff --cached --name-only`.
3. Read recent commit messages for tone: `git log --oneline -20` plus `git log -5 --format='%s%n%n%b'`.
4. Classify the dominant change type: `feat` / `fix` / `refactor` / `chore` / `docs` / `test`.
5. Compose the message following the rules below.
6. Output in a fenced block. Do NOT run `git commit` unless the user says to.
7. If the user says "commit it", run it using the HEREDOC form:
   ```bash
   git commit -m "$(cat <<'EOF'
   <subject>

   <body>
   EOF
   )"
   ```

## Message rules

**Subject line:**
- Format: `<type>: <imperative summary>`
- 72 characters or fewer
- Lowercase after the prefix
- Imperative mood ("add", "fix", "remove", not "added" or "adds")
- Describe the user-facing or system-level change, not the code change
- Good: `feat: auto-connect desktop to local server on first launch`
- Bad: `feat: add tryAutoConnectSync to _app.tsx beforeLoad`

**Body:**
- 1 to 3 sentences explaining WHY this change was made and WHAT it does for users or the system
- Write for someone who will never read the diff
- No file paths, function names, or variable names
- No line-by-line restating of the diff
- Use plain language: "The desktop app now finds and connects to the local server automatically" not "Added useEffect in __root.tsx that invokes read_local_connection"
- Group related changes with bullets when the commit spans multiple areas
- No em dashes. Use commas, periods, or parentheses.

**Skip the body** for genuinely trivial commits (typo, version bump). A bare subject is fine.

## Do not

- Do not reference code, paths, functions, or types in the message
- Do not run `git add`. The user controls staging.
- Do not run `git commit` unless explicitly told to.
- Do not amend unless the user says `--amend`.
- Do not skip hooks (`--no-verify`).
- Do not invent issue numbers.
