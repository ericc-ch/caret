import process from "node:process"
import { Agent, type Run, type SDKAgent } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { formatError } from "../lib/format-error.ts"
import { appRegistry } from "../reactivity/registry.tsx"
import { sessionSnapshotAtom } from "../reactivity/atoms.ts"
import type { Transcript } from "../scrollback/transcript.tsx"

export type SessionId = string

export type SessionStatus = { type: "idle" } | { type: "busy" }

export type SessionInfo = {
  id: SessionId
  title: string
  createdAt: number
  agentId: string
}

export type SessionSnapshot = {
  sessionId: SessionId
  status: SessionStatus
}

export type SessionEvent = { type: "snapshot"; snapshot: SessionSnapshot }

export class SessionNotFound extends Schema.TaggedErrorClass<SessionNotFound>()("SessionNotFound", {
  sessionId: Schema.String,
}) {}

export class AgentStartError extends Schema.TaggedErrorClass<AgentStartError>()("AgentStartError", {
  cause: Schema.Defect(),
}) {}

export class PromptError extends Schema.TaggedErrorClass<PromptError>()("PromptError", {
  sessionId: Schema.String,
  runId: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
}) {}

type SessionState = {
  info: SessionInfo
  status: SessionStatus
  agent: SDKAgent
  currentRun: Run | null
}

type PromptInput = {
  sessionId: SessionId
  text: string
  sink: Transcript
}

export type SessionInterface = {
  readonly create: (input?: { title?: string }) => Effect.Effect<SessionInfo, AgentStartError>
  readonly get: (sessionId: SessionId) => Effect.Effect<SessionInfo, SessionNotFound>
  readonly list: () => Effect.Effect<ReadonlyArray<SessionInfo>>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, SessionNotFound | PromptError>
  readonly interrupt: (sessionId: SessionId) => Effect.Effect<void, SessionNotFound>
  readonly status: (sessionId: SessionId) => Effect.Effect<SessionStatus, SessionNotFound>
  readonly events: (sessionId: SessionId) => Effect.Effect<SessionEvent, SessionNotFound>
}

function createSessionId() {
  return `ses_${crypto.randomUUID()}`
}

function defaultTitle() {
  return `Session ${new Date().toISOString()}`
}

function snapshot(state: SessionState): SessionSnapshot {
  return {
    sessionId: state.info.id,
    status: state.status,
  }
}

function publishSnapshot(state: SessionState) {
  appRegistry.set(sessionSnapshotAtom, snapshot(state))
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
  state: SessionState
  sink: Transcript
  runId?: string
  cause?: unknown
  detail?: string
}): PromptError {
  const detail = input.detail ?? formatError(input.cause)
  input.sink.writeError(detail)
  input.state.status = { type: "idle" }
  input.state.currentRun = null
  publishSnapshot(input.state)
  return new PromptError({ sessionId: input.state.info.id, runId: input.runId, detail })
}

export class Session extends Context.Service<Session, SessionInterface>()("@caret/Session", {
  make: Effect.gen(function* () {
    const sessions = yield* Ref.make(new Map<SessionId, SessionState>())

    const getState = (sessionId: SessionId) =>
      Ref.get(sessions).pipe(
        Effect.flatMap((store) => {
          const state = store.get(sessionId)
          return state ? Effect.succeed(state) : Effect.fail(new SessionNotFound({ sessionId }))
        }),
      )

    const create = Effect.fn("Session.create")(function* (input?: { title?: string }) {
      const agent = yield* Effect.tryPromise({
        try: () => Agent.create(agentOptions()),
        catch: (cause) => new AgentStartError({ cause }),
      })

      const info: SessionInfo = {
        id: createSessionId(),
        title: input?.title ?? defaultTitle(),
        createdAt: Date.now(),
        agentId: agent.agentId,
      }

      const state: SessionState = {
        info,
        status: { type: "idle" },
        agent,
        currentRun: null,
      }

      yield* Ref.update(sessions, (store) => {
        const next = new Map(store)
        next.set(info.id, state)
        return next
      })

      publishSnapshot(state)

      return info
    })

    const get = Effect.fn("Session.get")(function* (sessionId: SessionId) {
      const state = yield* getState(sessionId)
      return state.info
    })

    const list = Effect.fn("Session.list")(function* () {
      const store = yield* Ref.get(sessions)
      return [...store.values()]
        .map((state) => state.info)
        .sort((left, right) => left.createdAt - right.createdAt)
    })

    const status = Effect.fn("Session.status")(function* (sessionId: SessionId) {
      const state = yield* getState(sessionId)
      return state.status
    })

    const events = Effect.fn("Session.events")(function* (sessionId: SessionId) {
      const state = yield* getState(sessionId)
      return { type: "snapshot" as const, snapshot: snapshot(state) }
    })

    const interrupt = Effect.fn("Session.interrupt")(function* (sessionId: SessionId) {
      const state = yield* getState(sessionId)
      const run = state.currentRun
      if (!run?.supports("cancel")) return
      yield* Effect.tryPromise({
        try: () => run.cancel(),
        catch: () => undefined,
      }).pipe(Effect.ignore)
    })

    const prompt = Effect.fn("Session.prompt")(function* (input: PromptInput) {
      const state = yield* getState(input.sessionId)

      state.status = { type: "busy" }
      publishSnapshot(state)

      const sink = input.sink
      sink.writeUser(input.text)

      let assistantText = ""
      let thinkingText = ""
      let sawThinking = false
      let sawAssistant = false

      const finalizeStreams = () => {
        if (sawThinking) sink.updateThinking(thinkingText, true)
        if (sawAssistant) sink.updateAssistant(assistantText, true)
        sink.finish()
      }

      const run = yield* Effect.tryPromise({
        try: () => state.agent.send(input.text),
        catch: (cause) => failPrompt({ state, sink, cause }),
      })

      state.currentRun = run

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
              sink.updateAssistant(assistantText, false)
            }

            if (event.type === "thinking" && event.text) {
              thinkingText = event.text
              sawThinking = true
              sink.updateThinking(thinkingText, false)
            }
          }
        },
        catch: (cause) => {
          finalizeStreams()
          return failPrompt({ state, sink, runId: run.id, cause })
        },
      })

      finalizeStreams()

      const result = yield* Effect.tryPromise({
        try: () => run.wait(),
        catch: (cause) => failPrompt({ state, sink, runId: run.id, cause }),
      })

      if (state.currentRun === run) state.currentRun = null

      if (result.status === "error") {
        const trimmed = result.result?.trim()
        return yield* failPrompt({
          state,
          sink,
          runId: run.id,
          ...(trimmed ? { detail: trimmed } : { cause: result }),
        })
      }

      state.status = { type: "idle" }
      publishSnapshot(state)
    })

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const store = yield* Ref.get(sessions)
        for (const state of store.values()) {
          yield* Effect.sync(() => {
            void state.agent.close()
          })
        }
      }),
    )

    return {
      create,
      get,
      list,
      prompt,
      interrupt,
      status,
      events,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
