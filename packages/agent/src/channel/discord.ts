import process from "node:process"

import { Client, GatewayIntentBits, Partials } from "discord.js"
import { Context, Data, Effect, Layer, Queue, Redacted, Stream } from "effect"

import { AgentConfig } from "../lib/config.ts"
import {
  decodeExecutorPauseFromToolCall,
  pauseMessage,
  runFailureMessage,
} from "../lib/run-helpers.ts"
import { Sessions } from "../lib/sessions.ts"

import type { ChannelMessage } from "./types.ts"

class DiscordError extends Data.TaggedError("DiscordError")<{
  readonly cause: unknown
}> {}

const discordThreadId = (channelId: string) => `discord:${channelId}`

const makeMessages = (token: string) =>
  Stream.callback<ChannelMessage, DiscordError>(
    Effect.fn("DiscordChannel.messages")(function* (queue) {
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

        const text = message.content.trim()
        if (!text) return

        const channel = message.channel

        Queue.offerUnsafe(queue, {
          threadId: discordThreadId(channel.id),
          text,
          post: (body) =>
            Effect.tryPromise({
              try: async () => {
                await channel.send(body)
              },
              catch: (cause) => new DiscordError({ cause }),
            }).pipe(Effect.ignore),
        })
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

const runDiscordMessage = Effect.fn("runDiscordMessage")(function* (message: ChannelMessage) {
  const sessions = yield* Sessions
  const agent = yield* sessions.agent(message.threadId)
  const run = yield* Effect.promise(() => agent.send(message.text))

  let assistantText = ""

  yield* Stream.fromAsyncIterable(run.stream(), (cause) => new DiscordError({ cause })).pipe(
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) assistantText += block.text
          }
        }

        if (event.type === "tool_call") {
          const pause = decodeExecutorPauseFromToolCall(event)
          if (pause) yield* message.post(`⏸ ${pauseMessage(pause)}`)
        }
      }),
    ),
  )

  const result = yield* Effect.promise(() => run.wait())

  if (assistantText) {
    yield* message.post(assistantText)
    return
  }

  if (result.status === "error") {
    yield* message.post(runFailureMessage(result))
  }
})

export const handleDiscordMessage = (message: ChannelMessage) =>
  runDiscordMessage(message).pipe(Effect.catch(() => message.post("Run failed")))

export class DiscordChannel extends Context.Service<DiscordChannel>()(
  "@caret/agent/DiscordChannel",
  {
    make: Effect.gen(function* () {
      const { config } = yield* AgentConfig
      return { messages: makeMessages(Redacted.value(config.discordToken)) }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
