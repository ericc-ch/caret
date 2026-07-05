import process from "node:process"
import { Agent, type SDKAgent, type SDKAgentInfo } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { formatError } from "../lib/format-error.ts"
import { Commit, type TranscriptSink } from "../app/transcript/types.ts"

export type AgentId = string

export type { SDKAgentInfo }

export class AgentNotActive extends Schema.TaggedErrorClass<AgentNotActive>()(
  "AgentNotActive",
  {},
) {}

export class AgentStartError extends Schema.TaggedErrorClass<AgentStartError>()("AgentStartError", {
  cause: Schema.Defect(),
}) {}

export class SessionListError extends Schema.TaggedErrorClass<SessionListError>()("SessionListError", {
  cause: Schema.Defect(),
}) {}

export class SessionResumeError extends Schema.TaggedErrorClass<SessionResumeError>()(
  "SessionResumeError",
  {
    agentId: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class PromptError extends Schema.TaggedErrorClass<PromptError>()("PromptError", {
  agentId: Schema.String,
  runId: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
}) {}

type PromptInput = {
  readonly text: string
  readonly sink: TranscriptSink
}

export type SessionInterface = {
  readonly list: () => Effect.Effect<ReadonlyArray<SDKAgentInfo>, SessionListError>
  readonly create: (name?: string) => Effect.Effect<AgentId, AgentStartError>
  readonly resume: (agentId: AgentId) => Effect.Effect<AgentId, SessionResumeError>
  readonly activeAgentId: () => Effect.Effect<AgentId | undefined>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, AgentNotActive | PromptError>
}

function localSdkBase() {
  return { cwd: process.cwd() } as const
}

function createOptions(name?: string) {
  const apiKey = process.env["CURSOR_API_KEY"]
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(name ? { name } : {}),
    model: { id: "composer-2.5" as const },
    local: localSdkBase(),
  }
}

function disposeAgent(current: SDKAgent) {
  return Effect.tryPromise({
    try: () => current[Symbol.asyncDispose](),
    catch: (cause) => new AgentStartError({ cause }),
  }).pipe(Effect.ignore)
}

function failPrompt(input: {
  agentId: string
  sink: TranscriptSink
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

    const list = Effect.fn("Session.list")(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          Agent.list({
            runtime: "local",
            cwd: process.cwd(),
            limit: 50,
          }),
        catch: (cause) => new SessionListError({ cause }),
      })
      return result.items
    })

    const create = Effect.fn("Session.create")(function* (name?: string) {
      const next = yield* Effect.tryPromise({
        try: () => Agent.create(createOptions(name ?? "General chat")),
        catch: (cause) => new AgentStartError({ cause }),
      })

      const previous = yield* Ref.get(agent)
      if (previous) {
        yield* disposeAgent(previous)
      }

      yield* Ref.set(agent, next)
      return next.agentId
    })

    const resume = Effect.fn("Session.resume")(function* (agentId: AgentId) {
      const previous = yield* Ref.get(agent)
      if (previous) {
        yield* disposeAgent(previous)
      }

      const next = yield* Effect.tryPromise({
        try: () => Agent.resume(agentId, createOptions()),
        catch: (cause) => new SessionResumeError({ agentId, cause }),
      })

      yield* Ref.set(agent, next)
      return next.agentId
    })

    const activeAgentId = Effect.fn("Session.activeAgentId")(function* () {
      const current = yield* Ref.get(agent)
      return current?.agentId
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
        yield* disposeAgent(current)
      }),
    )

    return { list, create, resume, activeAgentId, prompt }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
