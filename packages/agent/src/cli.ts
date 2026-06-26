#!/usr/bin/env bun

import process from "node:process"

import { NodeRuntime } from "@effect/platform-node"
import { Effect, Terminal } from "effect"
import { Prompt } from "effect/unstable/cli"

import { SessionLayer } from "./lib/layers.ts"
import { workspaceDir } from "./lib/paths.ts"
import {
  decodeExecutorPauseFromToolCall,
  pauseMessage,
  runFailureMessage,
} from "./lib/run-helpers.ts"
import { CLI_SESSION_ID, Sessions } from "./lib/sessions.ts"
import { ensureWorkspace } from "./lib/workspace.ts"

const readMessage = Prompt.run(
  Prompt.text({
    message: "> ",
  }),
).pipe(Effect.catchTag("QuitError", () => Effect.succeed("")))

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* ensureWorkspace

    const sessions = yield* Sessions
    const agent = yield* sessions.agent(CLI_SESSION_ID)
    const terminal = yield* Terminal.Terminal

    yield* terminal.display(`workspace: ${workspaceDir}\n`)
    yield* terminal.display(`session: ${CLI_SESSION_ID}\n`)
    yield* terminal.display(`agent: ${agent.agentId}\n`)
    yield* terminal.display("caret-agent cli — type a message, empty line to quit\n\n")

    while (true) {
      const line = (yield* readMessage).trim()
      if (!line) break

      const run = yield* Effect.promise(() => agent.send(line))
      let assistantStarted = false

      yield* Effect.promise(async () => {
        for await (const event of run.stream()) {
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type !== "text" || !block.text) continue
              if (!assistantStarted) {
                process.stdout.write("\n")
                assistantStarted = true
              }
              process.stdout.write(block.text)
            }
          }

          if (event.type === "tool_call") {
            const pause = decodeExecutorPauseFromToolCall(event)
            if (pause) {
              process.stderr.write(`\n[pause] ${pauseMessage(pause)}\n`)
            }
          }
        }
      })

      if (assistantStarted) process.stdout.write("\n")

      const result = yield* Effect.promise(() => run.wait())

      if (result.status === "error") {
        yield* terminal.display(`run error: ${runFailureMessage(result)}\n`)
        yield* Effect.sync(() => {
          process.exitCode = 2
        })
      } else {
        yield* terminal.display(`[${result.status}] done\n`)
      }

      yield* terminal.display("\n")
    }
  }),
)

program.pipe(Effect.provide(SessionLayer), NodeRuntime.runMain)
