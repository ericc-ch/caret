import { Effect } from "effect"
import { Atom } from "effect/unstable/reactivity"
import type { TranscriptSink } from "./transcript.ts"
import { localAgentCwd } from "./workspace.ts"
import { Session, type AgentId } from "../services/session.ts"

export const sessionReactivity = ["sessions"] as const

export const sessionRuntime = Atom.runtime(Session.layer)

export const sessionsAtom = sessionRuntime
  .atom(Session.use((session) => session.list()))
  .pipe(Atom.keepAlive, Atom.withReactivity(sessionReactivity))

export const activeAgentIdAtom = Atom.make<AgentId | undefined>(undefined).pipe(Atom.keepAlive)

export const bootAtom = sessionRuntime.fn(
  Effect.fn(function* () {
    const sessions = yield* Session.use((session) => session.list())
    if (sessions.length === 0) {
      const activeId = yield* Session.use((session) => session.create())
      return { activeId }
    }

    const latest = [...sessions].sort(
      (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
    )[0]!
    const activeId = yield* Session.use((session) =>
      session.resume(latest.agentId, localAgentCwd(latest)),
    )
    return { activeId }
  }),
  { reactivityKeys: sessionReactivity },
)

export const refreshSessionsAtom = sessionRuntime.fn(
  () => Session.use((session) => session.list()),
  { reactivityKeys: sessionReactivity },
)

export const createSessionAtom = sessionRuntime.fn(
  (name?: string) => Session.use((session) => session.create(name)),
  { reactivityKeys: sessionReactivity },
)

export const resumeSessionAtom = sessionRuntime.fn(
  (input: { readonly agentId: AgentId; readonly cwd?: string }) =>
    Session.use((session) => session.resume(input.agentId, input.cwd)),
)

export const loadTranscriptAtom = sessionRuntime.fn(
  (input: { readonly agentId: AgentId; readonly cwd?: string }) =>
    Session.use((session) => session.loadTranscript(input.agentId, input.cwd)),
)

export const promptAtom = sessionRuntime.fn(
  (input: { readonly text: string; readonly sink: TranscriptSink }) =>
    Session.use((session) => session.prompt(input)),
)
