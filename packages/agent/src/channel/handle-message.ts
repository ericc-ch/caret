import type { Run, RunResult, SDKImage, SDKMessage, SDKUserMessage } from "@cursor/sdk"
import { Effect, Match, Stream } from "effect"

import { Sessions } from "../lib/sessions.ts"

import { channelCapabilities } from "./host.ts"
import {
  RunStreamError,
  type ChannelCapabilities,
  type ImageSource,
  type InboundMessage,
  type InboundPart,
  type OutboundMessage,
} from "./types.ts"

export type HandleMessageOptions = {
  readonly presentation: "folded" | "verbose"
}

const runFailureMessage = (result: RunResult) => result.result?.trim() || "Run failed"

const joinTextParts = (parts: ReadonlyArray<InboundPart | { type: "text"; text: string }>) =>
  parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim()

const unsupportedInboundParts = (
  parts: ReadonlyArray<InboundPart>,
  capabilities: ChannelCapabilities,
) => parts.filter((part) => !capabilities.inbound.has(part.type))

const filterInboundParts = (parts: ReadonlyArray<InboundPart>, capabilities: ChannelCapabilities) =>
  parts.filter((part) => capabilities.inbound.has(part.type))

const resolveImage = Effect.fn("resolveImage")((source: ImageSource) =>
  Match.value(source).pipe(
    Match.when({ kind: "url" }, ({ url }) => Effect.succeed({ url } satisfies SDKImage)),
    Match.when({ kind: "bytes" }, ({ data, mimeType }) =>
      Effect.succeed({
        data: Buffer.from(data).toString("base64"),
        mimeType,
      } satisfies SDKImage),
    ),
    Match.exhaustive,
  ),
)

const inboundForHandle = (inbound: InboundMessage) => {
  const capabilities = inbound.meta?.channelId
    ? channelCapabilities(inbound.meta.channelId)
    : undefined

  if (!capabilities) return { inbound, dropped: [] as const }

  const dropped = unsupportedInboundParts(inbound.parts, capabilities)
  if (dropped.length === 0) return { inbound, dropped }

  return {
    inbound: { ...inbound, parts: filterInboundParts(inbound.parts, capabilities) },
    dropped,
  }
}

const toSdkUserMessage = Effect.fn("toSdkUserMessage")(function* (inbound: InboundMessage) {
  const text = joinTextParts(inbound.parts)
  const images = yield* Effect.forEach(
    inbound.parts.flatMap((part) => (part.type === "image" ? [part] : [])),
    (part) => resolveImage(part.source),
  )

  if (images.length === 0) return text || "(empty)"

  return {
    text: text || "See attached image.",
    images,
  } satisfies SDKUserMessage
})

const consumeRunStream = Effect.fn("consumeRunStream")(function* (
  run: Run,
  options: HandleMessageOptions,
  reply: (outbound: OutboundMessage) => Effect.Effect<void>,
) {
  const assistantChunks: Array<string> = []
  let hadAssistantOutput = false

  yield* Stream.fromAsyncIterable(run.stream(), (cause) => new RunStreamError({ cause })).pipe(
    Stream.runForEach((event: SDKMessage) =>
      Effect.gen(function* () {
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type !== "text" || !block.text) continue

            if (options.presentation === "verbose") {
              yield* reply({ parts: [{ type: "text", text: block.text }] })
              hadAssistantOutput = true
            } else {
              assistantChunks.push(block.text)
            }
          }
        }

        if (options.presentation === "verbose" && event.type === "tool_call") {
          yield* reply({
            parts: [{ type: "text", text: `[tool ${event.name}] ${event.status}\n` }],
          })
        }

        if (options.presentation === "verbose" && event.type === "thinking" && event.text) {
          yield* reply({ parts: [{ type: "text", text: event.text }] })
        }
      }),
    ),
  )

  const assistantText = assistantChunks.join("")

  if (options.presentation === "folded" && assistantText) {
    yield* reply({ parts: [{ type: "text", text: assistantText }] })
  }

  return { assistantText, hadAssistantOutput }
})

export const handleMessage = Effect.fn("handleMessage")(function* (
  inbound: InboundMessage,
  options: HandleMessageOptions,
) {
  const { inbound: resolvedInbound, dropped } = inboundForHandle(inbound)

  if (dropped.length > 0) {
    yield* Effect.logWarning("Dropped unsupported inbound parts", {
      channel: inbound.meta?.channelId,
      kinds: dropped.map((part) => part.type),
    })
  }

  if (resolvedInbound.parts.length === 0) return { status: "finished" as const, id: "" }

  const sessions = yield* Sessions
  const agent = yield* sessions.agent(resolvedInbound.threadId)
  const sdkMessage = yield* toSdkUserMessage(resolvedInbound)
  const run = yield* Effect.promise(() => agent.send(sdkMessage))

  const { assistantText, hadAssistantOutput } = yield* consumeRunStream(
    run,
    options,
    resolvedInbound.reply,
  )
  const result = yield* Effect.promise(() => run.wait())

  if (!assistantText && !hadAssistantOutput && result.status === "error") {
    yield* resolvedInbound.reply({
      parts: [{ type: "text", text: runFailureMessage(result) }],
    })
  }

  return result
})
