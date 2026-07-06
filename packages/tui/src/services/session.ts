import { access } from "node:fs/promises"
import { execFile } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Agent, type SDKAgent, type SDKAgentInfo } from "@cursor/sdk"
import { Context, Effect, Layer, Ref, Schema, SubscriptionRef } from "effect"
import { formatError } from "../lib/format-error.ts"
import {
  applyCommit,
  Commit,
  entriesFromSdkMessages,
  type StreamCommit,
  type TranscriptEntry,
} from "../lib/transcript.ts"

const execFileAsync = promisify(execFile)

export type AgentId = string
export type ProjectCwd = string

export type SessionStatus = "booting" | "ready" | "prompting" | "unavailable"

export type CreateSessionInput = {
  readonly cwd?: ProjectCwd
  readonly name?: string
}

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

export type SessionInterface = {
  readonly list: () => Effect.Effect<ReadonlyArray<SDKAgentInfo>, SessionListError>
  readonly transcript: () => SubscriptionRef.SubscriptionRef<ReadonlyArray<TranscriptEntry>>
  readonly activeAgentId: () => Effect.Effect<AgentId | undefined>
  readonly status: () => Effect.Effect<SessionStatus>
  readonly boot: () => Effect.Effect<AgentId, SessionListError | AgentStartError | SessionResumeError>
  readonly switchTo: (agentId: AgentId) => Effect.Effect<AgentId, SessionResumeError | SessionListError>
  readonly close: (
    agentId: AgentId,
  ) => Effect.Effect<
    AgentId | undefined,
    SessionArchiveError | AgentStartError | SessionResumeError | SessionListError
  >
  readonly create: (input?: CreateSessionInput) => Effect.Effect<AgentId, AgentStartError>
  readonly openDirectory: (path: string) => Effect.Effect<AgentId, InvalidProjectPath | AgentStartError>
  readonly prompt: (text: string) => Effect.Effect<void, AgentNotActive | PromptError>
}

const DEFAULT_SESSION_NAME = "General chat"

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

export class Session extends Context.Service<Session, SessionInterface>()("@caret/Session", {
  make: Effect.gen(function* () {
    const activeAgent = yield* Ref.make<SDKAgent | undefined>(undefined)
    const activeAgentId = yield* Ref.make<AgentId | undefined>(undefined)
    const activeCwd = yield* Ref.make<ProjectCwd | undefined>(undefined)
    const openedCwds = yield* Ref.make<ReadonlySet<ProjectCwd>>(new Set())
    const status = yield* Ref.make<SessionStatus>("booting")
    const sessionsCache = yield* Ref.make<ReadonlyArray<SDKAgentInfo>>([])
    const transcript = yield* SubscriptionRef.make<ReadonlyArray<TranscriptEntry>>([])

    yield* Effect.tryPromise({
      try: () => seedOpenedCwds(),
      catch: (cause) => new SessionListError({ cause }),
    }).pipe(Effect.flatMap((cwds) => Ref.set(openedCwds, new Set(cwds))))

    const addOpenedCwd = Effect.fnUntraced(function* (cwd: ProjectCwd) {
      const current = yield* Ref.get(openedCwds)
      if (current.has(cwd)) return
      yield* Ref.set(openedCwds, new Set([...current, cwd]))
    })

    const resolveDefaultCwd = Effect.fnUntraced(function* () {
      const current = yield* Ref.get(activeCwd)
      if (current) return current
      return yield* Effect.tryPromise({
        try: () => resolveDefaultSdkCwd(),
        catch: (cause) => new AgentStartError({ cause }),
      })
    })

    const resolveCwdForAgent = Effect.fnUntraced(function* (agentId: AgentId) {
      const cached = yield* Ref.get(sessionsCache)
      const item = cached.find((session) => session.agentId === agentId)
      const fromList = item ? localAgentCwd(item) : undefined
      if (fromList) return fromList

      const current = yield* Ref.get(activeCwd)
      if (current) return current

      return yield* Effect.tryPromise({
        try: () => resolveDefaultSdkCwd(),
        catch: (cause) => new SessionResumeError({ agentId, cause }),
      })
    })

    const fetchTranscript = Effect.fnUntraced(function* (agentId: AgentId, cwd: ProjectCwd) {
      const messages = yield* Effect.tryPromise({
        try: () =>
          Agent.messages.list(agentId, {
            runtime: "local",
            cwd,
          }),
        catch: (cause) => new SessionListError({ cause }),
      })
      return entriesFromSdkMessages(messages)
    })

    const appendTranscript = (commit: StreamCommit) =>
      SubscriptionRef.update(transcript, (entries) => applyCommit(entries, commit))

    const syncAppendTranscript = (commit: StreamCommit) => {
      Effect.runSync(appendTranscript(commit))
    }

    const setTranscript = (entries: ReadonlyArray<TranscriptEntry>) =>
      SubscriptionRef.set(transcript, entries)

    const setUnavailable = (cause: unknown) =>
      Effect.gen(function* () {
        yield* Ref.set(status, "unavailable")
        yield* appendTranscript(Commit.Error({ text: formatError(cause) }))
      })

    const activateAgent = Effect.fnUntraced(function* (next: SDKAgent, cwd: ProjectCwd) {
      const previous = yield* Ref.get(activeAgent)
      if (previous && previous.agentId !== next.agentId) {
        yield* disposeAgent(previous)
      }
      yield* Ref.set(activeAgent, next)
      yield* Ref.set(activeAgentId, next.agentId)
      yield* Ref.set(activeCwd, cwd)
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

      const result = mergeListedAgents(lists).filter((item) => !item.archived)
      yield* Ref.set(sessionsCache, result)
      return result
    })

    const create = Effect.fn("Session.create")(function* (input?: CreateSessionInput) {
      const cwd = input?.cwd ? yield* Effect.succeed(input.cwd) : yield* resolveDefaultCwd()

      yield* addOpenedCwd(cwd)

      const next = yield* Effect.tryPromise({
        try: () => Agent.create(createOptions(cwd, input?.name ?? DEFAULT_SESSION_NAME)),
        catch: (cause) => new AgentStartError({ cause }),
      })

      yield* activateAgent(next, cwd)
      const entries = yield* fetchTranscript(next.agentId, cwd).pipe(
        Effect.mapError((error) => new AgentStartError({ cause: error })),
      )
      yield* setTranscript(entries)
      yield* Ref.set(status, "ready")
      return next.agentId
    })

    const switchTo = Effect.fn("Session.switchTo")(function* (agentId: AgentId) {
      const cwd = yield* resolveCwdForAgent(agentId)
      yield* addOpenedCwd(cwd)

      const next = yield* Effect.tryPromise({
        try: () => Agent.resume(agentId, createOptions(cwd)),
        catch: (cause) => new SessionResumeError({ agentId, cause }),
      })

      yield* activateAgent(next, cwd)
      const entries = yield* fetchTranscript(agentId, cwd)
      yield* setTranscript(entries)
      yield* Ref.set(status, "ready")
      return agentId
    })

    const boot = Effect.fn("Session.boot")(function* () {
      yield* Ref.set(status, "booting")
      return yield* Effect.gen(function* () {
        const sessions = yield* list()
        if (sessions.length === 0) return yield* create()
        return yield* switchTo(sessions[0]!.agentId)
      }).pipe(
        Effect.catch((cause) =>
          Effect.gen(function* () {
            yield* setUnavailable(cause)
            return yield* (cause as SessionListError | AgentStartError | SessionResumeError)
          }),
        ),
      )
    })

    const close = Effect.fn("Session.close")(function* (agentId: AgentId) {
      const sessions = yield* list()
      const currentActive = yield* Ref.get(activeAgentId)

      if (currentActive === agentId) {
        const current = yield* Ref.get(activeAgent)
        if (current) {
          yield* disposeAgent(current)
          yield* Ref.set(activeAgent, undefined)
        }
      }

      const cwd = yield* resolveCwdForAgent(agentId)
      yield* Effect.tryPromise({
        try: () => Agent.archive(agentId, { cwd }),
        catch: (cause) => new SessionArchiveError({ agentId, cause }),
      })

      if (currentActive !== agentId) return currentActive

      const next = nextTabAfterClose(sessions, agentId)
      if (!next) return yield* create()
      return yield* switchTo(next.agentId)
    })

    const openDirectory = Effect.fn("Session.openDirectory")(function* (path: string) {
      const result = yield* Effect.promise(() => resolveAndValidateProjectPath(path))
      if (!result.ok) {
        return yield* new InvalidProjectPath({ input: path, reason: result.error })
      }
      return yield* create({ cwd: result.path })
    })

    const prompt = Effect.fn("Session.prompt")(function* (text: string) {
      const current = yield* Ref.get(activeAgent)
      if (!current) return yield* new AgentNotActive()

      const agentId = current.agentId
      yield* Ref.set(status, "prompting")
      yield* appendTranscript(Commit.User({ text }))

      let assistantText = ""
      let thinkingText = ""
      let sawThinking = false
      let sawAssistant = false

      const failPrompt = (input: { runId?: string; cause?: unknown; detail?: string }) => {
        const detail = input.detail ?? formatError(input.cause)
        syncAppendTranscript(Commit.Error({ text: detail }))
        Effect.runSync(Ref.set(status, "unavailable"))
        return new PromptError({ agentId, runId: input.runId, detail })
      }

      yield* Effect.gen(function* () {
        const run = yield* Effect.tryPromise({
          try: () => current.send(text, { local: { force: true } }),
          catch: (cause) => failPrompt({ cause }),
        })

        yield* Effect.tryPromise({
          try: async () => {
            for await (const event of run.stream()) {
              if (event.type === "assistant") {
                const chunk = event.message.content
                  .flatMap((block) => (block.type === "text" ? [block.text] : []))
                  .join("")
                if (!chunk) continue

                assistantText += chunk
                sawAssistant = true
                syncAppendTranscript(Commit.Assistant({ text: assistantText, done: false }))
              }

              if (event.type === "thinking" && event.text) {
                thinkingText = event.text
                sawThinking = true
                syncAppendTranscript(Commit.Thinking({ text: thinkingText, done: false }))
              }
            }
          },
          catch: (cause) => failPrompt({ runId: run.id, cause }),
        })

        const result = yield* Effect.tryPromise({
          try: () => run.wait(),
          catch: (cause) => failPrompt({ runId: run.id, cause }),
        })

        if (result.status === "error") {
          const trimmed = result.result?.trim()
          return yield* failPrompt({
            runId: run.id,
            ...(trimmed ? { detail: trimmed } : { cause: result }),
          })
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            if (sawThinking) {
              yield* appendTranscript(Commit.Thinking({ text: thinkingText, done: true }))
            }
            if (sawAssistant) {
              yield* appendTranscript(Commit.Assistant({ text: assistantText, done: true }))
            }
            const currentStatus = yield* Ref.get(status)
            if (currentStatus === "prompting") {
              yield* Ref.set(status, "ready")
            }
          }),
        ),
      )
    })

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const current = yield* Ref.get(activeAgent)
        if (!current) return
        yield* disposeAgent(current)
      }),
    )

    return {
      list,
      transcript: () => transcript,
      activeAgentId: () => Ref.get(activeAgentId),
      status: () => Ref.get(status),
      boot,
      switchTo,
      close,
      create,
      openDirectory,
      prompt,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

// --- private helpers (ex-workspace.ts) ---

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

type ResolvePathResult =
  | { readonly ok: true; readonly path: ProjectCwd }
  | { readonly ok: false; readonly error: string }

async function resolveGitRoot(cwd = process.cwd()) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd })
    const root = stdout.trim()
    return root || undefined
  } catch {
    return undefined
  }
}

async function seedOpenedCwds(startCwd = process.cwd()) {
  const roots = new Set<ProjectCwd>([path.resolve(startCwd), packageRoot])
  const gitRoot = await resolveGitRoot(startCwd)
  if (gitRoot) roots.add(path.resolve(gitRoot))
  return [...roots]
}

async function resolveDefaultSdkCwd(cwd = process.cwd()) {
  return (await resolveGitRoot(cwd)) ?? path.resolve(cwd)
}

function localAgentCwd(info: SDKAgentInfo) {
  return "cwd" in info ? info.cwd : undefined
}

function resolveUserPath(input: string, base = process.cwd()): ResolvePathResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: "Path is required" }

  const expanded =
    trimmed.startsWith("~") && process.env["HOME"]
      ? path.join(process.env["HOME"], trimmed.slice(1))
      : trimmed

  const resolved = path.resolve(base, expanded)
  if (!path.isAbsolute(resolved)) {
    return { ok: false, error: "Path must resolve to an absolute directory" }
  }
  return { ok: true, path: resolved }
}

async function validateProjectDirectory(resolved: ProjectCwd): Promise<ResolvePathResult> {
  try {
    await access(resolved)
    return { ok: true, path: resolved }
  } catch {
    return { ok: false, error: `Directory not found: ${resolved}` }
  }
}

async function resolveAndValidateProjectPath(input: string): Promise<ResolvePathResult> {
  const resolved = resolveUserPath(input)
  if (!resolved.ok) return resolved
  return validateProjectDirectory(resolved.path)
}

function mergeListedAgents(lists: ReadonlyArray<ReadonlyArray<SDKAgentInfo>>) {
  const merged = new Map<string, SDKAgentInfo>()
  for (const items of lists) {
    for (const item of items) {
      const existing = merged.get(item.agentId)
      if (!existing || (item.lastModified ?? 0) >= (existing.lastModified ?? 0)) {
        merged.set(item.agentId, item)
      }
    }
  }
  return [...merged.values()].sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
}

function nextTabAfterClose(sessions: ReadonlyArray<SDKAgentInfo>, closingAgentId: AgentId) {
  const closingIndex = sessions.findIndex((session) => session.agentId === closingAgentId)
  if (closingIndex < 0) return undefined

  for (let index = closingIndex; index < sessions.length; index++) {
    const session = sessions[index]
    if (session && session.agentId !== closingAgentId) return session
  }
  for (let index = closingIndex - 1; index >= 0; index--) {
    const session = sessions[index]
    if (session && session.agentId !== closingAgentId) return session
  }
  return undefined
}
