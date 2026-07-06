import * as Cause from "effect/Cause"
import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Atom } from "effect/unstable/reactivity"
import process from "node:process"
import { formatError } from "../format-error.ts"
import { toTabViewModels } from "../tab-display.ts"
import { sessionInputForAgent } from "../workspace.ts"
import {
  createTabInDirectory,
  Session,
  type AgentId,
  type CreateTabInput,
  type LoadTranscriptInput,
  type SDKAgentInfo,
} from "../../services/session.ts"
import type { TranscriptSink } from "../transcript.ts"
import {
  evictTranscript,
  transcriptStateAtom,
} from "./transcript-atoms.ts"

export const sessionReactivity = ["sessions"] as const

export const sessionRuntime = Atom.runtime(Session.layer)

export const sessionsAtom = sessionRuntime
  .atom(Session.use((session) => session.list()))
  .pipe(Atom.keepAlive, Atom.withReactivity(sessionReactivity))

export const activeAgentIdAtom = Atom.make(undefined as AgentId | undefined).pipe(Atom.keepAlive)

export const promptSubmittingAtom = Atom.make(false).pipe(Atom.keepAlive)

function nextTabAfterClose(
  sessions: ReadonlyArray<SDKAgentInfo>,
  closingAgentId: AgentId,
) {
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

function sessionsFromResult(
  result: AsyncResult.AsyncResult<ReadonlyArray<SDKAgentInfo>, unknown>,
): ReadonlyArray<SDKAgentInfo> {
  return AsyncResult.isSuccess(result) ? result.value : []
}

export const sessionListAtom = Atom.make((get) => sessionsFromResult(get(sessionsAtom))).pipe(
  Atom.keepAlive,
)

function resumeInput(agentId: AgentId, sessions: ReadonlyArray<SDKAgentInfo>) {
  return sessionInputForAgent(agentId, sessions)
}

export const bootAtom = sessionRuntime.fn(
  Effect.fn("bootAtom")(function* (_void, get) {
    const sessions = yield* Session.use((session) => session.list())
    const activeId =
      sessions.length === 0
        ? yield* Session.use((session) => session.create())
        : yield* Session.use((session) => {
            const latest = sessions[0]!
            return session.resume(resumeInput(latest.agentId, sessions))
          })
    get.set(activeAgentIdAtom, activeId)
    return { activeId }
  }),
  { reactivityKeys: sessionReactivity },
)

export const createTabAtom = sessionRuntime.fn(
  Effect.fn("createTabAtom")(function* (input: CreateTabInput | undefined, get) {
    const agentId = yield* Session.use((session) => session.create(input))
    get.set(activeAgentIdAtom, agentId)
    return agentId
  }),
  { reactivityKeys: sessionReactivity },
)

export const switchTabAtom = sessionRuntime.fn(
  Effect.fn("switchTabAtom")(function* (agentId: AgentId, get) {
    const sessions = sessionsFromResult(get(sessionsAtom))
    const activeId = yield* Session.use((session) => session.resume(resumeInput(agentId, sessions)))
    get.set(activeAgentIdAtom, activeId)
    return activeId
  }),
  { reactivityKeys: sessionReactivity },
)

export const closeTabAtom = sessionRuntime.fn(
  Effect.fn("closeTabAtom")(function* (agentId: AgentId, get) {
    const sessions = sessionsFromResult(get(sessionsAtom))
    const activeId = get(activeAgentIdAtom)

    if (activeId === agentId) {
      yield* Session.use((session) => session.dispose(agentId))
    }

    yield* Session.use((session) => session.archive(resumeInput(agentId, sessions)))
    get.set(transcriptStateAtom, evictTranscript(get(transcriptStateAtom), agentId))

    if (activeId !== agentId) return

    const next = nextTabAfterClose(sessions, agentId)
    if (!next) {
      const createdId = yield* Session.use((session) => session.create())
      get.set(activeAgentIdAtom, createdId)
      return
    }

    const resumedId = yield* Session.use((session) =>
      session.resume(resumeInput(next.agentId, sessions)),
    )
    get.set(activeAgentIdAtom, resumedId)
  }),
  { reactivityKeys: sessionReactivity },
)

export const createTabInDirectoryAtom = sessionRuntime.fn(
  Effect.fn("createTabInDirectoryAtom")(function* (input: { readonly path: string }, get) {
    const agentId = yield* createTabInDirectory(input.path)
    get.set(activeAgentIdAtom, agentId)
    return agentId
  }),
  { reactivityKeys: sessionReactivity },
)

export const loadTranscriptAtom = sessionRuntime.fn(
  (input: LoadTranscriptInput) => Session.use((session) => session.loadTranscript(input)),
)

export const promptAtom = sessionRuntime.fn(
  (input: { readonly text: string; readonly sink: TranscriptSink }) =>
    Session.use((session) => session.prompt(input)),
)

export const tabViewModelsAtom = Atom.make((get) => {
  const tabs = sessionsFromResult(get(sessionsAtom))
  const activeId = get(activeAgentIdAtom)
  return toTabViewModels(tabs, activeId, process.cwd())
}).pipe(Atom.keepAlive)

export const bootingAtom = Atom.make((get) => {
  const result = get(bootAtom)
  return AsyncResult.isInitial(result) || AsyncResult.isWaiting(result)
}).pipe(Atom.keepAlive)

export const bootErrorAtom = Atom.make((get) => {
  const result = get(bootAtom)
  if (!AsyncResult.isFailure(result)) return undefined
  return formatError(Cause.squash(result.cause))
}).pipe(Atom.keepAlive)

export const promptStatusAtom = Atom.make((get) => {
  if (get(promptSubmittingAtom)) return "running" as const
  if (get(bootingAtom)) return "connecting" as const
  if (get(bootErrorAtom)) return "unavailable" as const
  return "ready" as const
}).pipe(Atom.keepAlive)

export {
  commitTranscript,
  emptyTranscriptState,
  evictTranscript,
  hydrateTranscript,
  switchTranscriptAgent,
  transcriptEntriesAtom,
  transcriptStateAtom,
} from "./transcript-atoms.ts"
