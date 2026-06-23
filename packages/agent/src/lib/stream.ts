import type { Run } from "@cursor/sdk"
import { Effect, Option, Schema, Stream } from "effect"

const ExecutorPausePayloadSchema = Schema.Struct({
  status: Schema.Literal("waiting_for_interaction"),
  executionId: Schema.String,
  interaction: Schema.Struct({
    kind: Schema.optional(Schema.Literals(["url", "form"])),
    message: Schema.optional(Schema.String),
    instructions: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
    address: Schema.optional(Schema.String),
    args: Schema.optional(Schema.Unknown),
    requestedSchema: Schema.optional(Schema.Unknown),
  }),
})

export type ExecutorPausePayload = typeof ExecutorPausePayloadSchema.Type

export type StreamRelay = {
  readonly onText?: (chunk: string, full: string) => void
  readonly onPause?: (payload: ExecutorPausePayload) => void
}

const decodePausePayload = Schema.decodeUnknownOption(ExecutorPausePayloadSchema)
const decodePauseFromJson = Schema.decodeUnknownOption(Schema.fromJsonString(ExecutorPausePayloadSchema))

const pauseFromToolResult = (result: unknown) =>
  Option.getOrUndefined(
    typeof result === "string" ? decodePauseFromJson(result) : decodePausePayload(result),
  )

export function relayStream(run: Run, relay: StreamRelay = {}) {
  return Stream.fromAsyncIterable(run.stream(), (cause) => cause).pipe(
    Stream.runFoldEffect(
      () => "",
      (assistantText, event) =>
        Effect.sync(() => {
          if (event.type === "assistant") {
            let text = assistantText
            for (const block of event.message.content) {
              if (block.type !== "text" || !block.text) continue
              text += block.text
              relay.onText?.(block.text, text)
            }
            return text
          }

          if (event.type === "tool_call" && event.status === "completed") {
            const pause = pauseFromToolResult(event.result)
            if (pause) relay.onPause?.(pause)
          }

          return assistantText
        }),
    ),
    Effect.map((assistantText) => ({ assistantText })),
  )
}
