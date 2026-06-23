#!/usr/bin/env bun

import process from "node:process"

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer, Terminal } from "effect"

import { Agent } from "./lib/agent.ts"
import { relayStream } from "./lib/stream.ts"
import { ensureWorkspace } from "./lib/workspace.ts"

const MainLayer = Agent.layer.pipe(Layer.provideMerge(NodeServices.layer))

const program = Effect.gen(function* () {
  yield* ensureWorkspace
  const agent = yield* Agent
  const terminal = yield* Terminal.Terminal

  yield* terminal.display(`workspace: ${agent.workspaceDir}\n`)
  yield* terminal.display(`agent: ${agent.agentId}\n`)
  yield* terminal.display("caret-agent cli — type a message, empty line to quit\n\n")

  while (true) {
    yield* terminal.display("> ")
    const line = (yield* terminal.readLine).trim()
    if (!line) break

    let assistantStarted = false

    const run = yield* Effect.promise(() => agent.cursor.send(line))
    yield* relayStream(run, {
      onText: (chunk) => {
        if (!assistantStarted) {
          process.stdout.write("\n")
          assistantStarted = true
        }
        process.stdout.write(chunk)
      },
      onPause: (payload) => {
        process.stderr.write(`\n[pause] ${payload.interaction.message ?? payload.executionId}\n`)
      },
    })
    const result = yield* Effect.promise(() => run.wait())

    if (assistantStarted) process.stdout.write("\n")

    if (result.status === "error") {
      yield* terminal.display(`run error: ${result.result?.trim() || "Run failed"}\n`)
      yield* Effect.sync(() => {
        process.exitCode = 2
      })
    } else {
      yield* terminal.display(`[${result.status}] run ${run.id}\n`)
    }

    yield* terminal.display("\n")
  }
})

program.pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
