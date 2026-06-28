import { Effect } from "effect"

import { SessionLayer } from "../lib/layers.ts"

import { ChannelNotConfigured, type Channel, type ChannelCapabilities } from "./types.ts"

const registry = new Map<string, Channel>()

export const parseChannelIds = (value: string) =>
  value
    .split(",")
    .map((channel) => channel.trim())
    .filter((channel) => channel.length > 0)

export const channelCapabilities = (id: string): ChannelCapabilities | undefined =>
  registry.get(id)?.capabilities

export const ChannelHost = {
  register(channel: Channel) {
    registry.set(channel.id, channel)
  },

  start(opts?: { only?: ReadonlyArray<string> }): Effect.Effect<void, unknown, never> {
    return Effect.gen(function* () {
      const ids = opts?.only ?? [...registry.keys()]

      for (const id of ids) {
        if (!registry.has(id)) {
          yield* Effect.logWarning(`Unknown channel: ${id}`)
        }
      }

      const channels = ids.flatMap((id) => {
        const channel = registry.get(id)
        return channel ? [channel] : []
      })

      if (channels.length === 0) {
        yield* Effect.logWarning("No channels to start", opts?.only ?? [])
        return
      }

      // Inbound messages are processed serially per adapter (Stream.runForEach).
      yield* Effect.all(
        channels.map((channel) => channel.start()),
        { concurrency: "unbounded", discard: true },
      )
    }).pipe(Effect.withSpan("channelHost.start"), Effect.provide(SessionLayer)) as Effect.Effect<
      void,
      unknown,
      never
    >
  },
} as const

ChannelHost.register({
  id: "slack",
  capabilities: {
    inbound: new Set(["text", "image"]),
    outbound: new Set(["text"]),
  },
  start: () => Effect.fail(new ChannelNotConfigured({ channelId: "slack" })),
})
