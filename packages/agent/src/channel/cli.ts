import process from "node:process"

import { Effect, Terminal } from "effect"
import { Prompt } from "effect/unstable/cli"

import { CLI_SESSION_ID, Sessions } from "../lib/sessions.ts"
import { workspaceDir } from "../lib/paths.ts"

import { handleMessage } from "./handle-message.ts"
import { ChannelHost } from "./host.ts"
import type { InboundMessage } from "./types.ts"

const readMessage = Prompt.run(
  Prompt.text({
    message: "> ",
  }),
).pipe(Effect.catchTag("QuitError", () => Effect.succeed("")))

const startCli = Effect.fn("cli.start")(function* () {
  const terminal = yield* Terminal.Terminal
  const sessions = yield* Sessions
  const agent = yield* sessions.agent(CLI_SESSION_ID)

  yield* terminal.display(`workspace: ${workspaceDir}\n`)
  yield* terminal.display(`session: ${CLI_SESSION_ID}\n`)
  yield* terminal.display(`agent: ${agent.agentId}\n`)
  yield* terminal.display("caret-agent chat — type a message, empty line to quit\n\n")

  while (true) {
    const line = (yield* readMessage).trim()
    if (!line) break

    let assistantStarted = false

    const inbound: InboundMessage = {
      threadId: CLI_SESSION_ID,
      parts: [{ type: "text", text: line }],
      reply: (outbound) =>
        Effect.sync(() => {
          for (const part of outbound.parts) {
            if (part.type !== "text" || !part.text) continue
            if (!assistantStarted) {
              process.stdout.write("\n")
              assistantStarted = true
            }
            process.stdout.write(part.text)
          }
        }),
      meta: { channelId: "cli" },
    }

    const result = yield* handleMessage(inbound, { presentation: "verbose" }).pipe(
      Effect.catch((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("CLI inbound failed", cause)
          yield* terminal.display("run error: Run failed\n")
          yield* Effect.sync(() => {
            process.exitCode = 2
          })
          return { status: "error" as const, id: "" }
        }),
      ),
    )

    if (assistantStarted) {
      yield* Effect.sync(() => {
        process.stdout.write("\n")
      })
    }

    if (result.status === "error") {
      yield* Effect.sync(() => {
        process.exitCode = 2
      })
    }

    yield* terminal.display(`[${result.status}] done\n\n`)
  }
})

ChannelHost.register({
  id: "cli",
  capabilities: {
    inbound: new Set(["text"]),
    outbound: new Set(["text"]),
  },
  start: startCli,
})
