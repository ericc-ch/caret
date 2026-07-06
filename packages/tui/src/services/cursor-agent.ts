import process from "node:process"
import { Agent, type Run, type SDKAgent } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema, Stream, SubscriptionRef } from "effect"
import { formatError } from "../lib/format-error.ts"
import {
  applyCommit,
  Commit,
  type StreamCommit,
  type TranscriptEntry,
} from "../lib/transcript.ts"

export type AgentStatus = "ready" | "connecting" | "running" | "unavailable"

export class AgentStartError extends Schema.TaggedErrorClass<AgentStartError>()("AgentStartError", {
  cause: Schema.Defect(),
}) {}

export class AgentBusy extends Schema.TaggedErrorClass<AgentBusy>()("AgentBusy", {}) {}

export class PromptError extends Schema.TaggedErrorClass<PromptError>()("PromptError", {
  agentId: Schema.optional(Schema.String),
  runId: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
}) {}

export type CursorAgentInterface = {
  readonly transcript: () => SubscriptionRef.SubscriptionRef<ReadonlyArray<TranscriptEntry>>
  readonly status: () => SubscriptionRef.SubscriptionRef<AgentStatus>
  readonly prompt: (text: string) => Effect.Effect<void, AgentBusy | AgentStartError | PromptError>
  readonly cancel: () => Effect.Effect<void>
}

function sessionName(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    "New conversation",
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  ].join(" ")
}

function createOptions() {
  const apiKey = process.env["CURSOR_API_KEY"]
  return {
    ...(apiKey ? { apiKey } : {}),
    name: sessionName(),
    model: { id: "composer-2.5" as const },
    local: { cwd: process.cwd() },
  }
}

const disposeAgent = Effect.fn("CursorAgent.disposeAgent")(function* (current: SDKAgent) {
  yield* Effect.tryPromise({
    try: () => current[Symbol.asyncDispose](),
    catch: () => undefined,
  }).pipe(Effect.ignore)
})

function appendCommit(
  transcript: SubscriptionRef.SubscriptionRef<ReadonlyArray<TranscriptEntry>>,
  commit: StreamCommit,
) {
  return SubscriptionRef.update(transcript, (entries) => applyCommit(entries, commit))
}

function errorDetail(error: PromptError | AgentStartError) {
  if (error instanceof PromptError) return error.detail ?? formatError(error)
  return formatError(error.cause)
}

export class CursorAgent extends Context.Service<CursorAgent, CursorAgentInterface>()(
  "@caret/tui/services/CursorAgent",
  {
    make: Effect.gen(function* () {
      const agent = yield* Ref.make<SDKAgent | undefined>(undefined)
      const activeRun = yield* Ref.make<Run | undefined>(undefined)
      const status = yield* SubscriptionRef.make<AgentStatus>("ready")
      const transcript = yield* SubscriptionRef.make<ReadonlyArray<TranscriptEntry>>([])

      const appendTranscript = (commit: StreamCommit) => appendCommit(transcript, commit)

      const getOrCreateAgent = Effect.fn("CursorAgent.getOrCreateAgent")(function* () {
        const current = yield* Ref.get(agent)
        if (current) return current

        yield* SubscriptionRef.set(status, "connecting")
        const next = yield* Effect.tryPromise({
          try: () => Agent.create(createOptions()),
          catch: (cause) => new AgentStartError({ cause }),
        })
        yield* Ref.set(agent, next)
        return next
      })

      const promptError = (input: { agentId?: string; runId?: string; cause?: unknown; detail?: string }) => {
        const detail = input.detail ?? formatError(input.cause)
        return new PromptError({
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.runId ? { runId: input.runId } : {}),
          detail,
        })
      }

      const failPrompt = Effect.fn("CursorAgent.failPrompt")(function* (error: PromptError | AgentStartError) {
        yield* appendTranscript(Commit.Error({ text: errorDetail(error) }))
        const hasAgent = Boolean(yield* Ref.get(agent))
        yield* SubscriptionRef.set(status, error instanceof AgentStartError || hasAgent ? "ready" : "unavailable")
        return yield* error
      })

      const prompt = Effect.fn("CursorAgent.prompt")(function* (text: string) {
        const currentStatus = yield* SubscriptionRef.get(status)
        if (currentStatus === "connecting" || currentStatus === "running") {
          return yield* new AgentBusy()
        }

        yield* appendTranscript(Commit.User({ text }))

        let assistantText = ""
        let thinkingText = ""
        let sawThinking = false
        let sawAssistant = false

        yield* Effect.gen(function* () {
          const current = yield* getOrCreateAgent()
          yield* SubscriptionRef.set(status, "running")

          const run = yield* Effect.tryPromise({
            try: () => current.send(text),
            catch: (cause) => promptError({ agentId: current.agentId, cause }),
          })
          yield* Ref.set(activeRun, run)

          yield* Stream.fromAsyncIterable(run.stream(), (cause) =>
            promptError({ agentId: current.agentId, runId: run.id, cause })
          ).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                if (event.type === "assistant") {
                  const chunk = event.message.content
                    .flatMap((block) => (block.type === "text" ? [block.text] : []))
                    .join("")
                  if (!chunk) return

                  assistantText += chunk
                  sawAssistant = true
                  yield* appendTranscript(Commit.Assistant({ text: assistantText, done: false }))
                }

                if (event.type === "thinking" && event.text) {
                  thinkingText = event.text
                  sawThinking = true
                  yield* appendTranscript(Commit.Thinking({ text: thinkingText, done: false }))
                }

                if (event.type === "tool_call") {
                  yield* appendTranscript(
                    Commit.Tool({
                      callId: event.call_id,
                      name: event.name,
                      status: event.status,
                      ...(event.args !== undefined ? { args: event.args } : {}),
                      ...(event.result !== undefined ? { result: event.result } : {}),
                      ...(event.truncated ? { truncated: event.truncated } : {}),
                    }),
                  )
                }
              }),
            ),
          )

          const result = yield* Effect.tryPromise({
            try: () => run.wait(),
            catch: (cause) => promptError({ agentId: current.agentId, runId: run.id, cause }),
          })

          if (result.status === "cancelled") {
            yield* appendTranscript(Commit.Error({ text: "Run cancelled" }))
            return
          }

          if (result.status === "error") {
            const trimmed = result.result?.trim()
            return yield* promptError({
              agentId: current.agentId,
              runId: run.id,
              ...(trimmed ? { detail: trimmed } : { cause: result }),
            })
          }
        }).pipe(
          Effect.catch(failPrompt),
          Effect.ensuring(
            Effect.gen(function* () {
              if (sawThinking) {
                yield* appendTranscript(Commit.Thinking({ text: thinkingText, done: true }))
              }
              if (sawAssistant) {
                yield* appendTranscript(Commit.Assistant({ text: assistantText, done: true }))
              }
              yield* Ref.set(activeRun, undefined)
              const currentStatus = yield* SubscriptionRef.get(status)
              if (currentStatus === "connecting" || currentStatus === "running") {
                yield* SubscriptionRef.set(status, "ready")
              }
            }),
          ),
        )
      })

      const cancel = Effect.fn("CursorAgent.cancel")(function* () {
        const run = yield* Ref.get(activeRun)
        if (!run) return
        if (!run.supports("cancel")) {
          yield* appendTranscript(
            Commit.Error({ text: run.unsupportedReason("cancel") ?? "Current run cannot be cancelled" }),
          )
          return
        }

        yield* Effect.tryPromise({
          try: () => run.cancel(),
          catch: (cause) => formatError(cause),
        }).pipe(
          Effect.catch((detail) => appendTranscript(Commit.Error({ text: detail }))),
        )
      })

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          const current = yield* Ref.get(agent)
          if (!current) return
          yield* disposeAgent(current)
        }),
      )

      return {
        transcript: () => transcript,
        status: () => status,
        prompt,
        cancel,
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
