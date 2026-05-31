---
name: check-domain
description: Run the structural check (check-domains) against the monorepo or a specific domain. Use after editing a domain to verify it still conforms.
---

# check-domain

Runs the same structural check `pnpm lint` runs for domains, so the agent can self-verify mid-task without invoking the full lint suite.

## Arguments

None required. The user MAY pass a domain name to scope output; if provided, filter the report to that domain. Otherwise, report on all.

## Steps

1. Run `node scripts/check-domains.mjs`. Capture exit code and output.
2. Report a single summary:
   - passed → "ok"
   - failed → list the violations in the format the script emits

If a specific domain was requested, grep the output for that domain's path and show only matching lines.

## When to use this

- After creating a new domain
- Before finishing a multi-file change inside a domain
- Whenever the user asks "is this domain ok"

## Do not

- Do not modify any files in this skill. It's read-only verification.
- Do not run the full `pnpm lint` — that's the gate-lint agent's job. This skill is the fast structural-only check.
