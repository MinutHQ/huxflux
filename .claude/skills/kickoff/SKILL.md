---
name: kickoff
description: Establish shared understanding of a task before writing any code. Restate the ask, surface ambiguity, ask 1-3 structured questions, propose an approach with trade-offs, get sign-off. Use at the start of any non-trivial task.
---

# kickoff

The first thing you run on a new task. Your job here is to understand what the human actually wants, not to start coding. A 60-second alignment check saves hours of building the wrong thing.

## When to use

Use whenever the user opens a session with a task description that is more than a one-liner with a clear answer. In particular:

- "Add a feature that..."
- "Make X better"
- "Refactor Y"
- "Fix the bug where..."
- "What do you think about..."

Skip for trivial mechanical asks ("rename `foo` to `bar`", "delete the unused `baz` import"). When in doubt, run it. The cost is small and the human can wave you through.

## Steps

### 1. Restate the task in your own words

One or two sentences. Cover what you think the user wants, what scope you're operating under, and what success looks like. If you got it wrong, the human will correct you for free, before any code is written.

Example:
> Restating: you want the tasks board to match what's on `main` today (sheet-overlay detail view, board-level chat, two-button sprint filter). Scope is the visual presentation only; the underlying data + handlers stay as they are.

### 2. Identify what is asked, implied, and ambiguous

Three separate lists:

- **Explicit**: what the user wrote in plain language
- **Implicit**: assumptions the request relies on but does not state ("you want this on web only", "you want backwards compatibility", "this should not change the database schema")
- **Ambiguous**: choices the user did NOT make and you should not silently make for them

Implicit assumptions deserve a sanity-check sentence ("I'm assuming X — say if not"). Ambiguities need a question.

### 3. Ask 1 to 3 structured questions

Use the `AskUserQuestion` tool when the choice is between 2 to 4 distinct paths. Pick the option you would recommend, mark it `(Recommended)`, list 2 to 3 alternatives with their trade-offs in the `description` field.

Use plain text in your reply when the question is open-ended or you just need a clarification on a single dimension.

Do not ask more than 3 questions. If you have more, you have not done enough thinking yet. Group related questions or pick the most load-bearing one.

Bad question (vague, no options): "What do you want?"

Good question (concrete, options, trade-offs):
> Which slice should the first commit cover?
> 1. Harness + runner (high value, complex)
> 2. Harness + pure helpers (easy wins, proves infra)
> 3. Harness + migrations (universal failure mode, sets up the DB pattern)
> 4. Just the harness (no tests yet)

### 4. Surface trade-offs the user might not have considered

If the task touches load-bearing decisions (architecture, public API shape, scope of cleanup, backwards compatibility, performance vs simplicity), call them out. The human owns these calls; you propose, they decide.

Example:
> One thing worth deciding before I start: do you want this behind a feature flag (safer rollback, more code) or as a permanent change (cleaner, harder to undo)?

### 5. Propose an approach and rough scope

In one short paragraph:
- The shape of the change (which domains, what new files, what gets refactored)
- An honest estimate: minutes / hours / days
- The biggest risk (what could go wrong, what you would do if it does)

### 6. Wait for alignment

Do NOT write code. Do NOT use the Edit or Write tools. Stop after step 5 and let the human respond.

When the human gives the go-ahead, exit kickoff mode and start the work. If they redirect on any of the questions, restate the new understanding and confirm once more before starting.

## What kickoff is NOT for

- Trivial mechanical asks (just do them)
- Continuing work the human has already aligned on in this session
- When the user says "you decide" — they have explicitly handed you the call

## Anti-patterns to avoid

- Asking vague open-ended questions ("what do you want this to look like?")
- Asking more than 3 questions
- Asking questions whose answers are obvious from the task description
- Asking questions and then starting to code anyway in the same response
- Restating the task in a way that hides assumptions behind plausible-sounding language

The goal is shared understanding before code. If you cannot articulate the task in one sentence that the human would sign off on, you are not ready to write code.
