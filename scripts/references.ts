#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

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
    name: "OpenClaw",
    directory: "openclaw",
    url: "https://github.com/openclaw/openclaw.git",
  },
  {
    name: "discord.js",
    directory: "discord.js",
    url: "https://github.com/discordjs/discord.js.git",
  },
  {
    name: "Hermes Agent",
    directory: "hermes-agent",
    url: "https://github.com/NousResearch/hermes-agent.git",
  },
] satisfies ReadonlyArray<ReferenceRepository>

const referencesDir = "/tmp/references"
const syncConcurrency = 4

const inheritedGit = (args: ReadonlyArray<string>, cwd: string) =>
  ChildProcess.make("git", args, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  })

const syncRepository = (repository: ReferenceRepository) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const repositoryPath = path.join(referencesDir, repository.directory)

    const finish = (exitCode: ChildProcessSpawner.ExitCode) => {
      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        process.exit(exitCode as number)
      }
    }

    if (yield* fs.exists(repositoryPath)) {
      yield* Console.log(`Pulling ${repository.name} updates...`)
      finish(yield* spawner.exitCode(inheritedGit(["pull", "--ff-only"], repositoryPath)))
      return
    }

    yield* Console.log(`Cloning ${repository.name}...`)
    const cloneArgs = ["clone", "--depth", "1"]
    if (repository.branch) {
      cloneArgs.push("--branch", repository.branch)
    }
    cloneArgs.push(repository.url, repository.directory)
    finish(yield* spawner.exitCode(inheritedGit(cloneArgs, referencesDir)))
  })

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem

  yield* Console.log("Setting up /tmp/references/ directory...")
  yield* fs.makeDirectory(referencesDir, { recursive: true })

  yield* Effect.forEach(repositories, syncRepository, {
    concurrency: syncConcurrency,
    discard: true,
  })

  yield* Console.log("")
  yield* Console.log("All reference repositories are up to date!")
  yield* Console.log("")
  yield* Console.log("Repositories:")

  const entries = yield* fs.readDirectory(referencesDir)
  for (const entry of [...entries].sort()) {
    yield* Console.log(entry)
  }
}).pipe(Effect.provide(NodeServices.layer))

NodeRuntime.runMain(program)
