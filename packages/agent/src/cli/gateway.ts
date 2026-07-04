import { Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import { ChannelHost, parseChannelIds } from "../channel/main.ts"
import { ensureWorkspace } from "../lib/workspace.ts"

const defaultGatewayChannels = ["discord"] as const

const runGateway = Effect.fn("caret-agent.gateway.run")(function* ({
  channels,
}: {
  readonly channels: ReadonlyArray<string>
}) {
  yield* ensureWorkspace
  yield* ChannelHost.start({ only: channels })
}, Effect.scoped)

const gatewayRunCommand = Command.make(
  "run",
  {
    channel: Flag.string("channel").pipe(
      Flag.withDescription("Comma-separated channel ids to start (e.g. discord)"),
      Flag.withDefault("discord"),
    ),
  },
  ({ channel }) => {
    const channels = parseChannelIds(channel)
    return runGateway({
      channels: channels.length > 0 ? channels : [...defaultGatewayChannels],
    })
  },
).pipe(
  Command.withShortDescription("Start inbound channel listeners"),
  Command.withDescription(
    "Run the multi-channel host. Connects enabled adapters and routes inbound messages to the agent.",
  ),
  Command.withExamples([
    {
      command: "caret-agent gateway run",
      description: "Start the Discord bot and process inbound messages",
    },
  ]),
)

export const gatewayCommand: Command.Command.Any = Command.make("gateway").pipe(
  Command.withShortDescription("Multi-channel inbound host"),
  Command.withDescription(
    "Long-running process that connects chat platforms and dispatches messages to caret-agent sessions.",
  ),
  Command.withSubcommands([gatewayRunCommand]),
)
