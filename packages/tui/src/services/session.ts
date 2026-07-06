import process from "node:process"
import { Agent, type SDKAgent, type SDKAgentInfo } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import {
  Commit,
  entriesFromSdkMessages,
  type TranscriptEntry,
  type TranscriptSink,
} from "../lib/transcript.ts"
import { formatError } from "../lib/format-error.ts"
import {
  mergeListedAgents,
  resolveAndValidateProjectPath,
  resolveDefaultSdkCwd,
  seedOpenedCwds,
  type ProjectCwd,
} from "../lib/workspace.ts"

export type AgentId = string

export type { SDKAgentInfo }

export type AgentTabInput = {
  readonly agentId: AgentId
  readonly cwd?: ProjectCwd
}

export type CreateTabInput = {
  readonly cwd?: ProjectCwd
  readonly name?: string
}

export type ResumeTabInput = AgentTabInput

export type LoadTranscriptInput = AgentTabInput

export type ArchiveTabInput = AgentTabInput

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

export class SessionArchiveError extends Schema.TaggedErrorClass<SessionArchiveError>()(
  "SessionArchiveError",
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

export class InvalidProjectPath extends Schema.TaggedErrorClass<InvalidProjectPath>()(
  "InvalidProjectPath",
  {
    input: Schema.String,
    reason: Schema.String,
  },
) {}

type PromptInput = {
  readonly text: string
  readonly sink: TranscriptSink
}

export type SessionInterface = {
  readonly list: () => Effect.Effect<ReadonlyArray<SDKAgentInfo>, SessionListError>
  readonly create: (input?: CreateTabInput) => Effect.Effect<AgentId, AgentStartError>
  readonly resume: (input: ResumeTabInput) => Effect.Effect<AgentId, SessionResumeError>
  readonly archive: (input: ArchiveTabInput) => Effect.Effect<void, SessionArchiveError>
  readonly dispose: (agentId: AgentId) => Effect.Effect<void>
  readonly loadTranscript: (
    input: LoadTranscriptInput,
  ) => Effect.Effect<ReadonlyArray<TranscriptEntry>, SessionListError>
  readonly activeAgentId: () => Effect.Effect<AgentId | undefined>
  readonly activeCwd: () => Effect.Effect<ProjectCwd | undefined>
  readonly openedCwds: () => Effect.Effect<ReadonlyArray<ProjectCwd>>
  readonly prompt: (input: PromptInput) => Effect.Effect<void, AgentNotActive | PromptError>
}

const DEFAULT_TAB_NAME = "General chat"

function createOptions(cwd: string, name?: string) {
  const apiKey = process.env["CURSOR_API_KEY"]
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(name ? { name } : {}),
    model: { id: "composer-2.5" as const },
    local: { cwd },
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
    const agentCwd = yield* Ref.make<ProjectCwd | undefined>(undefined)
    const openedCwds = yield* Ref.make<ReadonlySet<ProjectCwd>>(new Set())

    yield* Effect.tryPromise({
      try: () => seedOpenedCwds(),
      catch: (cause) => new SessionListError({ cause }),
    }).pipe(Effect.flatMap((cwds) => Ref.set(openedCwds, new Set(cwds))))

    const addOpenedCwd = Effect.fnUntraced(function* (cwd: ProjectCwd) {
      const current = yield* Ref.get(openedCwds)
      if (current.has(cwd)) return
      yield* Ref.set(openedCwds, new Set([...current, cwd]))
    })

    const resolveCwd = Effect.fnUntraced(function* (cwd: ProjectCwd | undefined) {
      if (cwd) return cwd
      const active = yield* Ref.get(agentCwd)
      if (active) return active
      return yield* Effect.tryPromise({
        try: () => resolveDefaultSdkCwd(),
        catch: (cause) => new AgentStartError({ cause }),
      })
    })

    const list = Effect.fn("Session.list")(function* () {
      const cwds = [...(yield* Ref.get(openedCwds))]
      const lists = yield* Effect.forEach(
        cwds,
        (cwd) =>
          Effect.tryPromise({
            try: () =>
              Agent.list({
                runtime: "local",
                cwd,
                limit: 50,
              }).then((result) => result.items),
            catch: (cause) => new SessionListError({ cause }),
          }),
        { concurrency: "unbounded" },
      )

      return mergeListedAgents(lists).filter((item) => !item.archived)
    })

    const create = Effect.fn("Session.create")(function* (input?: CreateTabInput) {
      const cwd = yield* input?.cwd
        ? Effect.succeed(input.cwd)
        : resolveCwd(undefined)

      yield* addOpenedCwd(cwd)

      const next = yield* Effect.tryPromise({
        try: () => Agent.create(createOptions(cwd, input?.name ?? DEFAULT_TAB_NAME)),
        catch: (cause) => new AgentStartError({ cause }),
      })

      const previous = yield* Ref.get(agent)
      if (previous) {
        yield* disposeAgent(previous)
      }

      yield* Ref.set(agent, next)
      yield* Ref.set(agentCwd, cwd)
      return next.agentId
    })

    const resume = Effect.fn("Session.resume")(function* (input: ResumeTabInput) {
      const resolvedCwd = yield* resolveCwd(input.cwd).pipe(
        Effect.mapError((cause) => new SessionResumeError({ agentId: input.agentId, cause })),
      )

      yield* addOpenedCwd(resolvedCwd)

      const previous = yield* Ref.get(agent)
      if (previous) {
        yield* disposeAgent(previous)
      }

      const next = yield* Effect.tryPromise({
        try: () => Agent.resume(input.agentId, createOptions(resolvedCwd)),
        catch: (cause) => new SessionResumeError({ agentId: input.agentId, cause }),
      })

      yield* Ref.set(agent, next)
      yield* Ref.set(agentCwd, resolvedCwd)
      return next.agentId
    })

    const dispose = Effect.fn("Session.dispose")(function* (agentId: AgentId) {
      const current = yield* Ref.get(agent)
      if (!current || current.agentId !== agentId) return
      yield* disposeAgent(current)
      yield* Ref.set(agent, undefined)
    })

    const archive = Effect.fn("Session.archive")(function* (input: ArchiveTabInput) {
      const resolvedCwd = yield* resolveCwd(input.cwd).pipe(
        Effect.mapError((cause) => new SessionArchiveError({ agentId: input.agentId, cause })),
      )

      yield* Effect.tryPromise({
        try: () => Agent.archive(input.agentId, { cwd: resolvedCwd }),
        catch: (cause) => new SessionArchiveError({ agentId: input.agentId, cause }),
      })
    })

    const loadTranscript = Effect.fn("Session.loadTranscript")(function* (input: LoadTranscriptInput) {
      const resolvedCwd = yield* resolveCwd(input.cwd).pipe(
        Effect.mapError((cause) => new SessionListError({ cause })),
      )
      const messages = yield* Effect.tryPromise({
        try: () =>
          Agent.messages.list(input.agentId, {
            runtime: "local",
            cwd: resolvedCwd,
          }),
        catch: (cause) => new SessionListError({ cause }),
      })
      return entriesFromSdkMessages(messages)
    })

    const activeAgentId = Effect.fn("Session.activeAgentId")(function* () {
      const current = yield* Ref.get(agent)
      return current?.agentId
    })

    const activeCwd = Effect.fn("Session.activeCwd")(function* () {
      return yield* Ref.get(agentCwd)
    })

    const openedCwdsList = Effect.fn("Session.openedCwds")(function* () {
      return [...(yield* Ref.get(openedCwds))]
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
        try: () => current.send(input.text, { local: { force: true } }),
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

    return {
      list,
      create,
      resume,
      archive,
      dispose,
      loadTranscript,
      activeAgentId,
      activeCwd,
      openedCwds: openedCwdsList,
      prompt,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

export const createTabInDirectory = Effect.fn("createTabInDirectory")(function* (path: string) {
  const result = yield* Effect.promise(() => resolveAndValidateProjectPath(path))
  if (!result.ok) {
    return yield* new InvalidProjectPath({ input: path, reason: result.error })
  }
  return yield* Session.use((session) => session.create({ cwd: result.path }))
})
