import type { RunResult, SDKToolUseMessage } from "@cursor/sdk"
import { Option, Schema } from "effect"

const ExecutorPauseSchema = Schema.Struct({
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

const decodePause = Schema.decodeUnknownOption(ExecutorPauseSchema)
const decodePauseFromJson = Schema.decodeUnknownOption(Schema.fromJsonString(ExecutorPauseSchema))

const decodeExecutorPause = (result: unknown) =>
  Option.getOrUndefined(
    typeof result === "string" ? decodePauseFromJson(result) : decodePause(result),
  )

export const decodeExecutorPauseFromToolCall = (event: SDKToolUseMessage) =>
  event.status === "completed" ? decodeExecutorPause(event.result) : undefined

export const pauseMessage = (pause: typeof ExecutorPauseSchema.Type) =>
  pause.interaction.message ?? pause.executionId

export const runFailureMessage = (result: RunResult) => result.result?.trim() || "Run failed"
