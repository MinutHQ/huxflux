# git

The server-side surface for everything that happens against a local git repository on behalf of an agent: worktree lifecycle (create, remove, move), file diffing and content reads against the agent's branch base, raw file writes inside a worktree, remote URL lookup, commit-and-push, the native-`fs.watch` file watcher that pushes `file:changed` over WebSocket, the pre-warmed reserve worktree pool that makes agent creation feel instant, and the per-worktree process registry used for port detection and shutdown cleanup.

## Owns

- Worktree lifecycle: `createWorktree` (with retry on stale entries), `removeWorktree`, `moveWorktree`
- File diffing: `getFileChanges`, `getDiff`, `getDiffSummary`, `getBaseFileContent`
- File read / write inside a worktree: `getFileContent`, `saveFileContent`, `getFileTree`
- Git metadata: `getRemoteUrl`, `commitAndPush`
- The worktree reservation pool (`pool.ts`): one hidden pre-warmed worktree per repo, so `createAgent` can claim it instead of paying the cold-path git work on every new agent. Reserves are built whether or not the repo has a setup script — the dominant cost on a fresh create is `git fetch` + `worktree add`, not the install. When a setup script is configured, it runs ahead of time too. `ensureReserve`, `claimReserve`, `drainReserves`, `initializeReserves`
- The file watcher (`watcher.ts`): per-agent native `fs.watch` (recursive) that debounces changes, refreshes `file_changes` rows in the DB, syncs the branch name when it drifts, and emits `agentsWs.fileChanged`. Attached lazily per open agent (see `watchAgent`). `watchWorktree`, `watchAgent`, `unwatchWorktree`, `refreshWorktree`
- The agent port registry (`processes.ts`): scans terminal output for `localhost:NNNN` patterns, persists detected ports per agent, validates them with `lsof`, broadcasts `ports:changed`. Also `killWorktreeProcesses` (used at shutdown and on agent teardown) for killing processes whose cwd is inside a worktree

## Public surface

- `createWorktree`: create a new worktree on a branch, with one-shot prune-and-retry on stale entries; ensures `.huxflux_attachments` is in `.git/info/exclude`
- `removeWorktree`: force-remove a worktree directory and prune git metadata
- `moveWorktree`: relocate a worktree to a new path (caller ensures nothing is using the old path)
- `getRemoteUrl`: read `git remote get-url <name>` (defaults to `origin`); returns null on failure
- `getFileChanges`: diff summary between HEAD and the resolved merge-base of `branchFrom`, plus uncommitted changes and untracked files, as a unified `FileChange[]`
- `getDiff`: unified diff for one file vs the merge-base, with a synthetic full-addition fallback for untracked files
- `getDiffSummary`: aggregated `{ additions, deletions, commits }` for the worktree vs `branchFrom`
- `getFileTree`: tree of tracked + untracked (non-ignored) paths as a nested `FileTreeEntry[]`
- `getFileContent`: raw file read from inside the worktree (empty string on error)
- `getBaseFileContent`: `git show <merge-base>:<path>` (the version of the file at the branch point)
- `saveFileContent`: write a file inside the worktree, creating parent directories as needed
- `commitAndPush`: stage everything, commit with the given message, push with `--set-upstream`
- `FileTreeEntry`: the recursive `{ name, path, type, children? }` shape returned by `getFileTree`
- `ensureReserve`: create the single hidden reserve worktree for a repo if one does not already exist; runs the setup script (if any) before recording the row
- `claimReserve`: atomically rename the reserve branch to the agent's branch, hard-reset to the latest base, delete the pool row, and trigger a background refill; returns `{ location }` or null
- `drainReserves`: remove every reserve worktree for a repo (used when the setup script changes so the next reserve can be rebuilt fresh, or when a repo is deleted)
- `initializeReserves`: on startup, drop stale entries from old multi-reserve configurations, then ensure one reserve exists for every repo
- `watchWorktree`: start a recursive `fs.watch` for an agent; debounced refresh persists `file_changes`, syncs the branch name if it drifts, and emits `file:changed`
- `watchAgent`: resolve an agent's worktree from the DB and `watchWorktree` it, then refresh once. Called lazily when a client opens an agent (first WS subscriber) so only watched agents poll. No-op for unknown / no-worktree / missing-path agents
- `unwatchWorktree`: stop watching and clear the pending debounce timer
- `refreshWorktree`: force a synchronous refresh without changing watcher state (used by routes that mutate the worktree and want the WS list refreshed immediately)
- `scanForPort`: strip ANSI from a terminal chunk and match it against three port patterns; returns the port number or null
- `registerPort`: persist a detected `(agentId, port)` pair (deduped) and broadcast `ports:changed`
- `unregisterPort`: drop one `(agentId, port)` row and rebroadcast
- `clearAgentPorts`: drop every port for an agent (used by the PTY exit hook and the agent-archive route)
- `getAllPortsFromDB`: read every recorded port, drop rows whose `lsof` says the listener is gone, return a `{ agentId, agentTitle, port }[]`; broadcasts a refreshed list if any rows were pruned
- `getAgentPortsFromDB`: read the ports for a single agent (no liveness check)
- `killWorktreeProcesses`: `lsof -d cwd` to find processes whose working directory is the worktree, then `SIGTERM` them and return `{ killed }`

## Depends on

- `simple-git`: wraps the git CLI for every git operation in this domain
- `node:fs` (`fs.watch`): file watching in `watcher.ts`
- `uuid`: generates reserve worktree ids and folder names in `pool.ts`
- `node:child_process`: `exec` / `execSync` for `lsof`-based port liveness and process kill (`processes.ts`), `spawn` for the reserve setup script (`pool.ts`)
- `node:fs`, `node:fs/promises`, `node:path`: file IO and path joining throughout
- `../../db/index.js`: shared Drizzle handle (read repo settings, worktree pool entries, agent ports, file changes, agent rows for branch sync)
- `../../db/schema.js`: Drizzle table definitions for `repos`, `worktreePool`, `agentPorts`, `agents`, `fileChanges` (owned by other domains, accessed via the schema barrel)
- `../../types.js`: `FileChange`, `AgentSummary`
- `../agents/ws.js`: `agentsWs` (the watcher emits `agentUpdated` / `fileChanged`; the process registry emits `portsChanged`)

## Sub-domains

None.

## Quirks

- `pool.ts` is conceptually adjacent to agents (the only consumer of `claimReserve` is the agent create route, and the only thing that calls `ensureReserve` / `drainReserves` outside the pool itself is the repos domain when a setup script changes). It lives here because the unit of work is a worktree, not an agent; the agents domain just composes it. If the pool ever grows responsibilities that are agent-shaped (per-agent quotas, etc.), this is the file that would migrate into `agents/service/`.
- `watcher.ts` uses native recursive `fs.watch` (250ms debounce): one FSEvents source per worktree on macOS, recursive inotify on Linux (Node 20+). It deliberately does NOT poll. The earlier implementation used chokidar with `usePolling` to dodge the EMFILE cascade that non-recursive `fs.watch` (one fd per directory) caused when dozens of agents were watched at once — but polling stat-ed every watched file (~9k per large worktree) every 400ms and burned a whole CPU core per watcher. Two changes removed both problems: watchers are now attached lazily, only for the agent a client currently has open (see `watchAgent`, wired to the WS subscription hook in `index.ts`), and the recursive `fs.watch` mode uses a single watch source for the whole tree rather than one fd per directory. Watching every agent on boot with per-file polling was what starved the event loop and pegged the CPU.
- `watcher.ts` emits `agentsWs.fileChanged` and `agentsWs.agentUpdated` directly. That cross-domain coupling is intentional (the watcher is owned by this domain, but the events belong to agents), and is the reason `git` depends on `agents/ws.ts`.
- `processes.ts` reads and writes the `agentPorts` Drizzle table even though it is declared in the agents domain. The table is morally agent-owned, but the helpers live here because they are paired with the worktree process lifecycle (PTY scanning, shutdown cleanup, dead-port pruning).
- The branch-sync in `watcher.ts` writes directly to the `agents` Drizzle row when the watcher detects that the worktree's HEAD branch changed (e.g. Claude pushed a PR and renamed the branch). This is the only place outside the agents domain that mutates `agents.branch`.
- `apps/server/src/domains/ws/pty.ts` imports `scanForPort` / `registerPort` / `clearAgentPorts` from this domain at the top of the file. The call sites are inside PTY data callbacks, but a top-level import works fine because the git domain does not import from `domains/ws/`.
- `getAllPortsFromDB` has a side effect (it prunes dead ports and re-broadcasts) even though its name reads like a pure read. That behaviour is preserved verbatim from the original; the dead-port cleanup poller in `agents/poller.ts` relies on it as the cleanup trigger.
