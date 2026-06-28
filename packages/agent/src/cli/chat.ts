import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { ChannelHost } from "../channel/index.ts"
import { ensureWorkspace } from "../lib/workspace.ts"

export const runChat = Effect.fn("caret-agent.chat")(
  function* () {
    yield* ensureWorkspace
    yield* ChannelHost.start({ only: ["cli"] })
  },
  Effect.scoped,
)

export const chatCommand = Command.make("chat", {}, runChat).pipe(
  Command.withShortDescription("Interactive terminal chat"),
  Command.withDescription(
    "Run a local REPL against the Cursor SDK agent. Sessions persist under cli:local.",
  ),
  Command.withExamples([
    {
      command: "caret-agent chat",
      description: "Start an interactive chat session in the workspace",
    },
  ]),
)
