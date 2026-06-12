import process from "node:process"
import { Agent, type Run, type SDKAgent } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"

export type SessionId = string

export type SessionStatus = { type: "idle" } | { type: "busy" }

export type SessionInfo = {
  id: SessionId
  title: string
  createdAt: number
  agentId: string
}

export type SessionMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming: boolean }
  | { role: "thinking"; text: string; streaming: boolean }

export type SessionSnapshot = {
  sessionId: SessionId
  status: SessionStatus
  messages: ReadonlyArray<SessionMessage>
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
  messages: Array<SessionMessage>
  agent: SDKAgent
  currentRun: Run | null
}

type PromptInput = {
  sessionId: SessionId
  text: string
  onSnapshot?: (snapshot: SessionSnapshot) => void
}

export type SessionInterface = {
  readonly create: (input?: { title?: string }) => Effect.Effect<SessionInfo, AgentStartError>
  readonly get: (sessionId: SessionId) => Effect.Effect<SessionInfo, SessionNotFound>
  readonly list: () => Effect.Effect<ReadonlyArray<SessionInfo>>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, SessionNotFound | PromptError>
  readonly interrupt: (sessionId: SessionId) => Effect.Effect<void, SessionNotFound>
  readonly status: (sessionId: SessionId) => Effect.Effect<SessionStatus, SessionNotFound>
  readonly messages: (sessionId: SessionId) => Effect.Effect<ReadonlyArray<SessionMessage>, SessionNotFound>
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
    messages: [...state.messages],
  }
}

function publishSnapshot(state: SessionState, onSnapshot?: (snapshot: SessionSnapshot) => void) {
  onSnapshot?.(snapshot(state))
}

function agentOptions() {
  const apiKey = process.env["CURSOR_API_KEY"]
  return {
    ...(apiKey ? { apiKey } : {}),
    model: { id: "composer-2.5" as const },
    local: { cwd: process.cwd() },
  }
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

      yield* Ref.update(sessions, (store) => {
        const next = new Map(store)
        next.set(info.id, {
          info,
          status: { type: "idle" },
          messages: [],
          agent,
          currentRun: null,
        })
        return next
      })

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

    const messages = Effect.fn("Session.messages")(function* (sessionId: SessionId) {
      const state = yield* getState(sessionId)
      return [...state.messages]
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
      state.messages.push({ role: "user", text: input.text })
      publishSnapshot(state, input.onSnapshot)

      let assistantIndex: number | undefined
      let thinkingIndex: number | undefined

      const run = yield* Effect.tryPromise({
        try: () => state.agent.send(input.text),
        catch: (cause) =>
          new PromptError({
            sessionId: input.sessionId,
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
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

              assistantIndex ??= state.messages.push({ role: "assistant", text: "", streaming: true }) - 1
              const message = state.messages[assistantIndex]
              if (message?.role === "assistant") message.text += text
              publishSnapshot(state, input.onSnapshot)
            }

            if (event.type === "thinking" && event.text) {
              thinkingIndex ??= state.messages.push({ role: "thinking", text: "", streaming: true }) - 1
              const message = state.messages[thinkingIndex]
              if (message?.role === "thinking") message.text = event.text
              publishSnapshot(state, input.onSnapshot)
            }
          }
        },
        catch: (cause) =>
          new PromptError({
            sessionId: input.sessionId,
            runId: run.id,
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
      })

      const result = yield* Effect.tryPromise({
        try: () => run.wait(),
        catch: (cause) =>
          new PromptError({
            sessionId: input.sessionId,
            runId: run.id,
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
      })

      if (state.currentRun === run) state.currentRun = null

      if (assistantIndex !== undefined) {
        const message = state.messages[assistantIndex]
        if (message?.role === "assistant") message.streaming = false
      }
      if (thinkingIndex !== undefined) {
        const message = state.messages[thinkingIndex]
        if (message?.role === "thinking") message.streaming = false
      }

      if (result.status === "error") {
        state.status = { type: "idle" }
        publishSnapshot(state, input.onSnapshot)
        const detail = result.result?.trim()
        return yield* new PromptError({
          sessionId: input.sessionId,
          runId: run.id,
          detail: detail || undefined,
        })
      }

      state.status = { type: "idle" }
      publishSnapshot(state, input.onSnapshot)
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
      messages,
      events,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
