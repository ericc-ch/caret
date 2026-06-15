import process from "node:process"
import { Agent, type SDKAgent } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { formatError } from "../lib/format-error.ts"
import { Scrollback, type StreamCommit } from "../scrollback/scrollback.tsx"

export type AgentId = string

export class AgentNotActive extends Schema.TaggedErrorClass<AgentNotActive>()("AgentNotActive", {}) {}

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
}

export type SessionInterface = {
  readonly create: () => Effect.Effect<AgentId, AgentStartError>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, AgentNotActive | PromptError, Scrollback>
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
  scrollback: { append: (commit: StreamCommit) => void }
  agentId: string
  runId?: string
  cause?: unknown
  detail?: string
}) {
  const msg = input.detail ?? formatError(input.cause)
  input.scrollback.append({ _tag: "Error", text: msg })
  return new PromptError({ agentId: input.agentId, runId: input.runId, detail: msg })
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

      const scrollback = yield* Scrollback
      const agentId = current.agentId

      scrollback.append({ _tag: "User", text: input.text })

      const run = yield* Effect.tryPromise({
        try: () => current.send(input.text),
        catch: (cause) => failPrompt({ scrollback, agentId, cause }),
      })

      yield* Effect.tryPromise({
        try: async () => {
          for await (const event of run.stream()) {
            if (event.type === "assistant") {
              const text = event.message.content
                .flatMap((block) => (block.type === "text" ? [block.text] : []))
                .join("")
              if (!text) continue

              scrollback.append({ _tag: "Assistant", text })
            }

            if (event.type === "thinking" && event.text) {
              scrollback.append({ _tag: "Thinking", text: event.text })
            }
          }
        },
        catch: (cause) => {
          scrollback.finish()
          return failPrompt({ scrollback, agentId, runId: run.id, cause })
        },
      })

      scrollback.finish()

      const result = yield* Effect.tryPromise({
        try: () => run.wait(),
        catch: (cause) => failPrompt({ scrollback, agentId, runId: run.id, cause }),
      })

      if (result.status === "error") {
        const trimmed = result.result?.trim()
        return yield* failPrompt({
          scrollback,
          agentId,
          runId: run.id,
          ...(trimmed ? { detail: trimmed } : { cause: result }),
        })
      }
    })

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const current = yield* Ref.get(agent)
        if (!current) return
        yield* Effect.sync(() => void current.close())
      })
    )

    return { create, prompt }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
