import { Atom } from "effect/unstable/reactivity"
import {
  applyCommit,
  type StreamCommit,
  type TranscriptEntry,
} from "../transcript.ts"
import type { AgentId } from "../../services/session.ts"

export type TranscriptState = {
  readonly activeAgentId: AgentId | undefined
  readonly cache: ReadonlyMap<AgentId, ReadonlyArray<TranscriptEntry>>
  readonly entries: ReadonlyArray<TranscriptEntry>
}

export const emptyTranscriptState = (): TranscriptState => ({
  activeAgentId: undefined,
  cache: new Map(),
  entries: [],
})

export const transcriptStateAtom = Atom.make(emptyTranscriptState()).pipe(Atom.keepAlive)

export const transcriptEntriesAtom = Atom.make((get) => get(transcriptStateAtom).entries).pipe(
  Atom.keepAlive,
)

export function switchTranscriptAgent(
  state: TranscriptState,
  agentId: AgentId | undefined,
): TranscriptState {
  const nextCache = new Map(state.cache)
  if (state.activeAgentId) {
    nextCache.set(state.activeAgentId, state.entries)
  }
  return {
    activeAgentId: agentId,
    cache: nextCache,
    entries: agentId ? (nextCache.get(agentId) ?? []) : [],
  }
}

export function commitTranscript(state: TranscriptState, commit: StreamCommit): TranscriptState {
  const entries = applyCommit(state.entries, commit)
  const nextCache = new Map(state.cache)
  if (state.activeAgentId) {
    nextCache.set(state.activeAgentId, entries)
  }
  return { ...state, entries, cache: nextCache }
}

export function hydrateTranscript(
  state: TranscriptState,
  agentId: AgentId,
  next: ReadonlyArray<TranscriptEntry>,
): TranscriptState {
  const nextCache = new Map(state.cache)
  nextCache.set(agentId, next)
  return {
    ...state,
    cache: nextCache,
    entries: state.activeAgentId === agentId ? next : state.entries,
  }
}

export function evictTranscript(state: TranscriptState, agentId: AgentId): TranscriptState {
  const nextCache = new Map(state.cache)
  nextCache.delete(agentId)
  const closingActive = state.activeAgentId === agentId
  return {
    activeAgentId: closingActive ? undefined : state.activeAgentId,
    cache: nextCache,
    entries: closingActive ? [] : state.entries,
  }
}

