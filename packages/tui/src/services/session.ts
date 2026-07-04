import process from "node:process"
import { Agent, type SDKAgent } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { formatError } from "../lib/format-error.ts"
import { Commit } from "../scrollback/stream-commit.ts"
import type { Transcript } from "../scrollback/transcript.tsx"

export type AgentId = string

export class AgentNotActive extends Schema.TaggedErrorClass<AgentNotActive>()(
  "AgentNotActive",
  {},
) {}

export class AgentStartError extends Schema.TaggedErrorClass<AgentStartError>()("AgentStartError", {
  cause: Schema.Defect(),
}) {}

export class PromptError extends Schema.TaggedErrorClass<PromptError>()("PromptError", {
  agentId: Schema.String,
  runId: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
}) {}

type PromptInput = {
  readonly text: string
  readonly sink: Transcript
}

export type SessionInterface = {
  readonly create: () => Effect.Effect<AgentId, AgentStartError>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, AgentNotActive | PromptError>
}

function agentOptions() {
  const apiKey = process.env["CURSOR_API_KEY"]
  return {
    ...(apiKey ? { apiKey } : {}),
    model: { id: "composer-2.5" as const },
    local: { cwd: process.cwd() },
  }
}

function failPrompt(input: {
  agentId: string
  sink: Transcript
  runId?: string
  cause?: unknown
  detail?: string
}) {
  const detail = input.detail ?? formatError(input.cause)
  input.sink.commit(Commit.Error({ text: detail }))
  return new PromptError({ agentId: input.agentId, runId: input.runId, detail })
}

export class Session extends Context.Service<Session, SessionInterface>()("@caret/Session", {
  make: Effect.gen(function* () {
    const agent = yield* Ref.make<SDKAgent | undefined>(undefined)

    const create = Effect.fn("Session.create")(function* () {
      const next = yield* Effect.tryPromise({
        try: () => Agent.create(agentOptions()),
        catch: (cause) => new AgentStartError({ cause }),
      })

      const previous = yield* Ref.get(agent)
      if (previous) {
        yield* Effect.sync(() => {
          void previous.close()
        })
      }

      yield* Ref.set(agent, next)
      return next.agentId
    })

    const prompt = Effect.fn("Session.prompt")(function* (input: PromptInput) {
      const current = yield* Ref.get(agent)
      if (!current) return yield* new AgentNotActive()

      const sink = input.sink
      const agentId = current.agentId

      sink.commit(Commit.User({ text: input.text }))

      let assistantText = ""
      let thinkingText = ""
      let sawThinking = false
      let sawAssistant = false

      const run = yield* Effect.tryPromise({
        try: () => current.send(input.text),
        catch: (cause) => failPrompt({ agentId, sink, cause }),
      })

      yield* Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: async () => {
            for await (const event of run.stream()) {
              if (event.type === "assistant") {
                const text = event.message.content
                  .flatMap((block) => (block.type === "text" ? [block.text] : []))
                  .join("")
                if (!text) continue

                assistantText += text
                sawAssistant = true
                sink.commit(Commit.Assistant({ text: assistantText, done: false }))
              }

              if (event.type === "thinking" && event.text) {
                thinkingText = event.text
                sawThinking = true
                sink.commit(Commit.Thinking({ text: thinkingText, done: false }))
              }
            }
          },
          catch: (cause) => failPrompt({ agentId, sink, runId: run.id, cause }),
        })

        const result = yield* Effect.tryPromise({
          try: () => run.wait(),
          catch: (cause) => failPrompt({ agentId, sink, runId: run.id, cause }),
        })

        if (result.status === "error") {
          const trimmed = result.result?.trim()
          return yield* failPrompt({
            agentId,
            sink,
            runId: run.id,
            ...(trimmed ? { detail: trimmed } : { cause: result }),
          })
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (sawThinking) {
              sink.commit(Commit.Thinking({ text: thinkingText, done: true }))
            }
            if (sawAssistant) {
              sink.commit(Commit.Assistant({ text: assistantText, done: true }))
            }
          }),
        ),
      )
    })

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const current = yield* Ref.get(agent)
        if (!current) return
        yield* Effect.sync(() => void current.close())
      }),
    )

    return { create, prompt }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
