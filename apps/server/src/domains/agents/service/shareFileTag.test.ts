import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createTestDb, silenceLogs, type SilencedLogs, type TestDb } from "../../../../test/harness.js"
import { agentFileHandler } from "./shareFileTag.js"
import { sharedFilesDir } from "./sharedFiles.js"

const AGENT_ID = "agent-share-tag-1"

let testDb: TestDb
let logs: SilencedLogs
let root: string
let worktree: string

beforeEach(() => {
  logs = silenceLogs()
  testDb = createTestDb()
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hux-share-tag-root-"))
  worktree = fs.mkdtempSync(path.join(os.tmpdir(), "hux-share-tag-wt-"))
})

afterEach(() => {
  testDb.close()
  logs.restore()
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(worktree, { recursive: true, force: true })
})

describe("agentFileHandler", () => {
  it("shares a worktree-relative file and returns it as a shared file", async () => {
    fs.writeFileSync(path.join(worktree, "app.apk"), "apk")
    const handler = agentFileHandler(AGENT_ID, worktree, root)
    const outcome = await handler.onTag({ args: { path: "app.apk" }, body: "" })
    expect(outcome && "sharedFiles" in outcome ? outcome.sharedFiles : null).toEqual([
      { name: "app.apk", file: expect.stringMatching(/^[0-9a-f]{8}-app\.apk$/), size: 3 },
    ])
    expect(fs.readdirSync(sharedFilesDir(AGENT_ID, root))).toHaveLength(1)
  })

  it("reports a failed share back to the agent as a follow-up", async () => {
    const handler = agentFileHandler(AGENT_ID, worktree, root)
    const outcome = await handler.onTag({ args: { path: "missing.apk" }, body: "" })
    expect(outcome && "followUp" in outcome ? outcome.followUp : null).toEqual({
      sender: "system",
      content: expect.stringMatching(/^Sharing missing\.apk with the user failed: .*missing\.apk does not exist$/),
    })
    expect(outcome && "sharedFiles" in outcome).toBe(false)
  })
})
