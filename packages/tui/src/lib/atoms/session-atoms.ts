import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Atom } from "effect/unstable/reactivity"
import process from "node:process"
import {
  Session,
  type AgentId,
  type CreateSessionInput,
  type SDKAgentInfo,
} from "../../services/session.ts"
import { toSessionLabels } from "../session-display.ts"

export const sessionReactivity = ["sessions"] as const

export const sessionRuntime = Atom.runtime(Session.layer)

function sessionsFromResult(
  result: AsyncResult.AsyncResult<ReadonlyArray<SDKAgentInfo>, unknown>,
): ReadonlyArray<SDKAgentInfo> {
  return AsyncResult.isSuccess(result) ? result.value : []
}

function activeIdFromResult(
  result: AsyncResult.AsyncResult<AgentId | undefined, unknown>,
): AgentId | undefined {
  return AsyncResult.isSuccess(result) ? result.value : undefined
}

function statusFromResult(
  result: AsyncResult.AsyncResult<
    "booting" | "ready" | "prompting" | "unavailable",
    unknown
  >,
) {
  return AsyncResult.isSuccess(result) ? result.value : "booting" as const
}

// --- reads ---

export const sessionsAtom = sessionRuntime
  .atom(Session.use((session) => session.list()))
  .pipe(Atom.keepAlive, Atom.withReactivity(sessionReactivity))

export const sessionListAtom = Atom.make((get) => sessionsFromResult(get(sessionsAtom))).pipe(
  Atom.keepAlive,
)

export const transcriptAtom = sessionRuntime
  .subscriptionRef(Session.use((session) => Effect.succeed(session.transcript())))
  .pipe(Atom.keepAlive)

export const transcriptEntriesAtom = Atom.make((get) => {
  const value = get(transcriptAtom)
  return Array.isArray(value) ? value : []
}).pipe(Atom.keepAlive)

export const activeSessionAtom = sessionRuntime
  .atom(Session.use((session) => session.activeAgentId()))
  .pipe(Atom.keepAlive)

const sessionStatusAtom = sessionRuntime
  .atom(Session.use((session) => session.status()))
  .pipe(Atom.keepAlive)

export const sessionLabelsAtom = Atom.make((get) => {
  const sessions = sessionsFromResult(get(sessionsAtom))
  const activeId = activeIdFromResult(get(activeSessionAtom))
  return toSessionLabels(sessions, activeId, process.cwd())
}).pipe(Atom.keepAlive)

// --- writes ---

export const bootAtom = sessionRuntime.fn(
  Effect.fn("bootAtom")(() => Session.use((session) => session.boot())),
  { reactivityKeys: sessionReactivity },
)

export const promptStatusAtom = Atom.make((get) => {
  const boot = get(bootAtom)
  if (AsyncResult.isInitial(boot) || AsyncResult.isWaiting(boot)) return "connecting" as const
  if (AsyncResult.isFailure(boot)) return "unavailable" as const

  const status = statusFromResult(get(sessionStatusAtom))
  switch (status) {
    case "booting":
      return "connecting" as const
    case "prompting":
      return "running" as const
    case "unavailable":
      return "unavailable" as const
    case "ready":
      return "ready" as const
    default:
      return "connecting" as const
  }
}).pipe(Atom.keepAlive)

export const switchSessionAtom = sessionRuntime.fn(
  Effect.fn("switchSessionAtom")((agentId: AgentId) =>
    Session.use((session) => session.switchTo(agentId)),
  ),
  { reactivityKeys: sessionReactivity },
)

export const closeSessionAtom = sessionRuntime.fn(
  Effect.fn("closeSessionAtom")((agentId: AgentId) =>
    Session.use((session) => session.close(agentId)),
  ),
  { reactivityKeys: sessionReactivity },
)

export const createSessionAtom = sessionRuntime.fn(
  Effect.fn("createSessionAtom")((input: CreateSessionInput | undefined) =>
    Session.use((session) => session.create(input)),
  ),
  { reactivityKeys: sessionReactivity },
)

export const openDirectoryAtom = sessionRuntime.fn(
  Effect.fn("openDirectoryAtom")((input: { readonly path: string }) =>
    Session.use((session) => session.openDirectory(input.path)),
  ),
  { reactivityKeys: sessionReactivity },
)

export const promptAtom = sessionRuntime.fn(
  Effect.fn("promptAtom")((text: string) => Session.use((session) => session.prompt(text))),
)
