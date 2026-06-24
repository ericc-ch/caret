#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

type ReferenceRepository = {
  readonly name: string
  readonly directory: string
  readonly url: string
  readonly branch?: string
}

const repositories = [
  {
    name: "Effect v4",
    directory: "effect-smol",
    url: "https://github.com/Effect-TS/effect-smol.git",
  },
  {
    name: "OpenTUI",
    directory: "opentui",
    url: "https://github.com/anomalyco/opentui.git",
  },
  {
    name: "opentui-spinner",
    directory: "opentui-spinner",
    url: "https://github.com/msmps/opentui-spinner.git",
  },
  {
    name: "OpenCode",
    directory: "opencode",
    url: "https://github.com/anomalyco/opencode.git",
    branch: "dev",
  },
  {
    name: "Cursor Cookbook",
    directory: "cursor-cookbook",
    url: "https://github.com/cursor/cookbook.git",
  },
  {
    name: "Playwright",
    directory: "playwright",
    url: "https://github.com/microsoft/playwright.git",
  },
  {
    name: "Executor",
    directory: "executor",
    url: "https://github.com/RhysSullivan/executor.git",
  },
  {
    name: "Playwriter",
    directory: "playwriter",
    url: "https://github.com/remorses/playwriter.git",
  },
  {
    name: "Agent Browser",
    directory: "agent-browser",
    url: "https://github.com/vercel-labs/agent-browser.git",
  },
  {
    name: "OpenClaw",
    directory: "openclaw",
    url: "https://github.com/openclaw/openclaw.git",
  },
] satisfies ReadonlyArray<ReferenceRepository>

const referencesDir = "/tmp/references"

const run = (command: string, args: ReadonlyArray<string>, cwd = referencesDir) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log("Setting up /tmp/references/ directory...")

mkdirSync(referencesDir, { recursive: true })

for (const repository of repositories) {
  const repositoryPath = join(referencesDir, repository.directory)

  if (existsSync(repositoryPath)) {
    console.log(`Pulling ${repository.name} updates...`)
    run("git", ["pull", "--ff-only"], repositoryPath)
  } else {
    console.log(`Cloning ${repository.name}...`)
    const cloneArgs = ["clone", "--depth", "1"]
    if (repository.branch) {
      cloneArgs.push("--branch", repository.branch)
    }
    cloneArgs.push(repository.url, repository.directory)
    run("git", cloneArgs, referencesDir)
  }
}

console.log("")
console.log("All reference repositories are up to date!")
console.log("")
console.log("Repositories:")
for (const entry of readdirSync(referencesDir).sort()) {
  console.log(entry)
}
