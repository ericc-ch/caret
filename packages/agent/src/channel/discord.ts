import process from "node:process"

import { Client, GatewayIntentBits, Partials, type Message } from "discord.js"
import { Effect, Queue, Redacted, Stream } from "effect"

import { AgentConfig } from "../lib/config.ts"
import { ConfigLayer } from "../lib/layers.ts"

import { handleMessage } from "./handle-message.ts"
import { ChannelHost } from "./host.ts"
import {
  DiscordError,
  type InboundMessage,
  type InboundPart,
  type OutboundMessage,
} from "./types.ts"

const discordThreadId = (channelId: string) => `discord:${channelId}` as const

const discordInboundParts = (
  content: string,
  attachments: Iterable<{ contentType?: string | null; url: string }>,
) => {
  const parts: Array<InboundPart> = []

  if (content.trim()) {
    parts.push({ type: "text", text: content.trim() })
  }

  for (const attachment of attachments) {
    if (attachment.contentType?.startsWith("image/")) {
      parts.push({ type: "image", source: { kind: "url", url: attachment.url } })
    }
  }

  return parts
}

const outboundText = (outbound: OutboundMessage) =>
  outbound.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim()

const postToDiscord = Effect.fn("discord.post")((
  channel: Message["channel"],
  outbound: OutboundMessage,
) => {
  const body = outboundText(outbound)
  if (!body || !channel.isSendable()) return Effect.void

  return Effect.tryPromise({
    try: async () => {
      await channel.send(body)
    },
    catch: (cause) => new DiscordError({ cause }),
  }).pipe(Effect.catch((error) => Effect.logError("Discord reply failed", error)))
})

const toInbound = (message: Message): InboundMessage | null => {
  const parts = discordInboundParts(message.content, message.attachments.values())
  if (parts.length === 0) return null

  const channel = message.channel

  return {
    threadId: discordThreadId(channel.id),
    parts,
    reply: (outbound) => postToDiscord(channel, outbound),
    meta: {
      channelId: "discord",
      authorId: message.author.id,
      messageId: message.id,
    },
  }
}

const listenDiscord = (token: string) =>
  Stream.callback<InboundMessage, DiscordError>(
    Effect.fn("discord.listen")(function* (queue) {
      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel],
      })

      client.on("messageCreate", (message) => {
        if (message.author.bot) return

        const inbound = toInbound(message)
        if (!inbound) return

        Queue.offerUnsafe(queue, inbound)
      })

      yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            new Promise<void>((resolve, reject) => {
              client.once("ready", () => {
                process.stderr.write(`Discord connected as ${client.user?.tag ?? "unknown"}\n`)
                resolve()
              })
              client.once("error", reject)
              void client.login(token).catch(reject)
            }),
          catch: (cause) => new DiscordError({ cause }),
        }),
        () => Effect.promise(() => client.destroy()),
      )
    }),
  )

const runInbound = Effect.fn("discord.runInbound")((inbound: InboundMessage) =>
  handleMessage(inbound, { presentation: "folded" }).pipe(
    Effect.catch((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("Discord inbound failed", cause)
        yield* inbound.reply({ parts: [{ type: "text", text: "Run failed" }] })
      }),
    ),
  ),
)

const startDiscord = Effect.fn("discord.start")(
  function* () {
    const { config } = yield* AgentConfig
    const token = Redacted.value(config.discordToken)
    yield* Stream.runForEach(listenDiscord(token), runInbound)
  },
  Effect.provide(ConfigLayer),
  Effect.scoped,
)

ChannelHost.register({
  id: "discord",
  capabilities: {
    inbound: new Set(["text", "image"]),
    outbound: new Set(["text"]),
  },
  start: startDiscord,
})
