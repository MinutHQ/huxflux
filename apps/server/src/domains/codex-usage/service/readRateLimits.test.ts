import { afterEach, describe, expect, it } from "vitest"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readRateLimits } from "./readRateLimits.js"

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

async function fakeBinary(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "codex-usage-test-"))
  dirs.push(dir)
  const binary = join(dir, "codex")
  await writeFile(binary, `#!${process.execPath}\n${body}`)
  await chmod(binary, 0o755)
  return binary
}

describe("readRateLimits", () => {
  it("completes the handshake before requesting usage and ignores notifications", async () => {
    const binary = await fakeBinary(`
      const readline = require('node:readline');
      let initialized = false;
      readline.createInterface({ input: process.stdin }).on('line', (line) => {
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') process.stdout.write(JSON.stringify({ id: 0, result: {} }) + '\\n');
        if (msg.method === 'initialized') initialized = true;
        if (msg.method === 'account/rateLimits/read') {
          if (!initialized) process.exit(1);
          process.stdout.write(JSON.stringify({ method: 'notice', params: {} }) + '\\n');
          process.stdout.write(JSON.stringify({ id: 1, result: { rateLimits: { primary: null } } }) + '\\n');
        }
      });
    `)
    await expect(readRateLimits(binary)).resolves.toEqual({ rateLimits: { primary: null } })
  })
  it("handles a missing executable", async () => {
    await expect(readRateLimits("/nonexistent/huxflux-codex")).rejects.toThrow("unavailable")
  })
  it("bounds an unresponsive subprocess", async () => {
    const binary = await fakeBinary("setInterval(() => {}, 1000)")
    await expect(readRateLimits(binary, 100)).rejects.toThrow("timed out")
  })
  it("handles early exit", async () => {
    const binary = await fakeBinary("process.exit(1)")
    await expect(readRateLimits(binary)).rejects.toThrow("exited")
  })
  it("handles malformed output", async () => {
    const binary = await fakeBinary("process.stdout.write('not json\\n'); setInterval(() => {}, 1000)")
    await expect(readRateLimits(binary)).rejects.toThrow("Invalid")
  })
  it("does not expose upstream error details", async () => {
    const binary = await fakeBinary(`process.stdout.write(JSON.stringify({ id: 0, error: { message: 'sensitive upstream details' } }) + '\\n'); setInterval(() => {}, 1000)`)
    await expect(readRateLimits(binary)).rejects.toThrow("check Codex sign-in")
  })
})
