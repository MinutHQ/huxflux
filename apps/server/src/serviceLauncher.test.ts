import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { spawnSync } from "node:child_process"
import { buildLauncherTail, buildSupervisorExecLine, getServiceEnvFilePath, resolveSupervisorCommand } from "./serviceLauncher.js"

// Each test lays out a real directory tree that mimics a Node install, with
// real symlinks, so the resolver runs against the filesystem it will see.
let root: string

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hx-launcher-")))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function touch(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, "")
}

function link(target: string, at: string) {
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.symlinkSync(target, at)
}

describe("resolveSupervisorCommand", () => {
  it("uses the opt symlink for Homebrew node instead of the versioned Cellar path", () => {
    const prefix = path.join(root, "homebrew")
    const cellarNode = path.join(prefix, "Cellar/node/26.3.0/bin/node")
    touch(cellarNode)
    link("../Cellar/node/26.3.0", path.join(prefix, "opt/node"))
    link("../Cellar/node/26.3.0/bin/node", path.join(prefix, "bin/node"))
    link("../lib/node_modules/@minuthq/huxflux/dist/cli.js", path.join(prefix, "bin/huxflux"))
    const cli = path.join(prefix, "lib/node_modules/@minuthq/huxflux/dist/cli.js")
    touch(cli)

    const cmd = resolveSupervisorCommand(cellarNode, cli)

    expect(cmd.nodeBin).toBe(path.join(prefix, "opt/node/bin/node"))
    expect(cmd.cliPath).toBe(cli)
    expect(fs.existsSync(cmd.nodeBin)).toBe(true)
    expect(fs.existsSync(cmd.cliPath)).toBe(true)
    expect(cmd.nodeBin).not.toContain("Cellar")
  })

  it("uses the opt symlink for keg-only Homebrew node@22", () => {
    const prefix = path.join(root, "homebrew")
    const cellarNode = path.join(prefix, "Cellar/node@22/22.11.0/bin/node")
    touch(cellarNode)
    link("../Cellar/node@22/22.11.0", path.join(prefix, "opt/node@22"))
    const cli = path.join(prefix, "lib/node_modules/@minuthq/huxflux/dist/cli.js")
    touch(cli)

    const cmd = resolveSupervisorCommand(cellarNode, cli)

    expect(cmd.nodeBin).toBe(path.join(prefix, "opt/node@22/bin/node"))
  })

  it("maps a CLI installed inside the Cellar to the opt symlink too", () => {
    const prefix = path.join(root, "homebrew")
    const kegRoot = path.join(prefix, "Cellar/node@22/22.11.0")
    const cellarNode = path.join(kegRoot, "bin/node")
    const cellarCli = path.join(kegRoot, "lib/node_modules/@minuthq/huxflux/dist/cli.js")
    touch(cellarNode)
    touch(cellarCli)
    link("../Cellar/node@22/22.11.0", path.join(prefix, "opt/node@22"))

    const cmd = resolveSupervisorCommand(cellarNode, cellarCli)

    expect(cmd.cliPath).toBe(path.join(prefix, "opt/node@22/lib/node_modules/@minuthq/huxflux/dist/cli.js"))
  })

  it("keeps the Cellar path when the opt symlink points at another version", () => {
    const prefix = path.join(root, "homebrew")
    const oldNode = path.join(prefix, "Cellar/node/25.0.0/bin/node")
    touch(oldNode)
    touch(path.join(prefix, "Cellar/node/26.3.0/bin/node"))
    link("../Cellar/node/26.3.0", path.join(prefix, "opt/node"))

    const cmd = resolveSupervisorCommand(oldNode, path.join(prefix, "cli.js"))

    expect(cmd.nodeBin).toBe(oldNode)
  })

  it("keeps the exact node binary for nvm installs", () => {
    const nvmNode = path.join(root, ".nvm/versions/node/v24.1.0/bin/node")
    const cli = path.join(root, ".nvm/versions/node/v24.1.0/lib/node_modules/@minuthq/huxflux/dist/cli.js")
    touch(nvmNode)
    touch(cli)

    expect(resolveSupervisorCommand(nvmNode, cli)).toEqual({ nodeBin: nvmNode, cliPath: cli })
  })

  it("keeps the exact node binary for volta and nodejs.org installs", () => {
    const voltaNode = path.join(root, ".volta/tools/image/node/22.11.0/bin/node")
    const cli = path.join(root, ".volta/tools/image/packages/@minuthq/huxflux/lib/node_modules/@minuthq/huxflux/dist/cli.js")
    touch(voltaNode)
    touch(cli)

    expect(resolveSupervisorCommand(voltaNode, cli)).toEqual({ nodeBin: voltaNode, cliPath: cli })
  })
})

describe("buildSupervisorExecLine", () => {
  it("execs node with the CLI script explicitly, bypassing the shebang", () => {
    expect(buildSupervisorExecLine({ nodeBin: "/opt/homebrew/opt/node/bin/node", cliPath: "/opt/homebrew/lib/node_modules/@minuthq/huxflux/dist/cli.js" }))
      .toBe(`exec "/opt/homebrew/opt/node/bin/node" "/opt/homebrew/lib/node_modules/@minuthq/huxflux/dist/cli.js" _supervisor`)
  })
})

describe("buildLauncherTail", () => {
  const cmd = { nodeBin: "/usr/local/bin/node", cliPath: "/usr/local/lib/huxflux/cli.js" }

  it("sources the env file after the defaults and just before exec", () => {
    const lines = buildLauncherTail("/home/me/huxflux/env", cmd)
    const sourceIndex = lines.findIndex(l => l.includes(`set -a; . "$HUXFLUX_ENV_FILE"; set +a`))

    expect(lines).toContain(`HUXFLUX_ENV_FILE="/home/me/huxflux/env"`)
    expect(sourceIndex).toBeGreaterThanOrEqual(0)
    expect(sourceIndex).toBe(lines.length - 2)
    expect(lines.at(-1)).toBe(buildSupervisorExecLine(cmd))
  })

  it("puts the env file in the data dir", () => {
    expect(getServiceEnvFilePath("/home/me/huxflux-dev")).toBe("/home/me/huxflux-dev/env")
  })
})

describe("generated launcher with an env file", () => {
  // Runs a real launcher fragment in bash. The exec'd "CLI" is a script that
  // prints the env it was started with, so the test sees exactly what the
  // supervisor would.
  function runLauncher(dataDir: string, env: NodeJS.ProcessEnv = {}): Record<string, string | null> {
    const cliPath = path.join(root, "print-env.js")
    fs.writeFileSync(cliPath, `const keys = ["FOO", "QUOTED", "TOKEN", "ANTHROPIC_API_KEY", "HUXFLUX_ENV_FILE"]
process.stdout.write(JSON.stringify(Object.fromEntries(keys.map(k => [k, process.env[k] ?? null]))))`)
    const launcher = path.join(root, "huxflux-server.sh")
    fs.writeFileSync(launcher, [
      "#!/bin/bash",
      `export FOO=default`,
      ...buildLauncherTail(getServiceEnvFilePath(dataDir), { nodeBin: process.execPath, cliPath }),
    ].join("\n"), { mode: 0o755 })

    const result = spawnSync("/bin/bash", [launcher], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    return JSON.parse(result.stdout) as Record<string, string | null>
  }

  it("overrides launcher defaults and exports plain KEY=value lines", () => {
    const dataDir = path.join(root, "data dir with spaces")
    fs.mkdirSync(dataDir)
    fs.writeFileSync(path.join(dataDir, "env"), `FOO=from-env-file\nQUOTED="two words"\n`, { mode: 0o600 })

    const seen = runLauncher(dataDir)

    expect(seen.FOO).toBe("from-env-file")
    expect(seen.QUOTED).toBe("two words")
    expect(seen.HUXFLUX_ENV_FILE).toBeNull()
  })

  it("runs shell snippets such as reading a token file and unsetting a key", () => {
    const dataDir = path.join(root, "data")
    fs.mkdirSync(dataDir)
    fs.writeFileSync(path.join(root, "claude-token"), "sk-ant-oat-test\n")
    fs.writeFileSync(path.join(dataDir, "env"), [
      `[ -r "${path.join(root, "claude-token")}" ] && export TOKEN="$(/bin/cat "${path.join(root, "claude-token")}")"`,
      "unset ANTHROPIC_API_KEY",
      "",
    ].join("\n"))

    const seen = runLauncher(dataDir, { ANTHROPIC_API_KEY: "should-be-removed" })

    expect(seen.TOKEN).toBe("sk-ant-oat-test")
    expect(seen.ANTHROPIC_API_KEY).toBeNull()
  })

  it("starts normally and does not create the file when it is missing", () => {
    const dataDir = path.join(root, "data")
    fs.mkdirSync(dataDir)

    const seen = runLauncher(dataDir)

    expect(seen.FOO).toBe("default")
    expect(fs.existsSync(path.join(dataDir, "env"))).toBe(false)
  })
})
