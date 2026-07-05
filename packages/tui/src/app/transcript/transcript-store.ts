import { createSignal } from "solid-js"
import {
  applyCommit,
  type StreamCommit,
  type TranscriptEntry,
  type TranscriptSink,
} from "../../lib/transcript.ts"

export function createTranscriptStore(): TranscriptSink & {
  entries: () => ReadonlyArray<TranscriptEntry>
  hasCache: (agentId: string) => boolean
  switchAgent: (agentId: string | undefined) => void
  hydrate: (agentId: string, next: ReadonlyArray<TranscriptEntry>) => void
} {
  const cache = new Map<string, ReadonlyArray<TranscriptEntry>>()
  let activeAgentId: string | undefined
  const [entries, setEntries] = createSignal<ReadonlyArray<TranscriptEntry>>([])

  const persist = (next: ReadonlyArray<TranscriptEntry>) => {
    setEntries(next)
    if (activeAgentId) {
      cache.set(activeAgentId, next)
    }
  }

  const switchAgent = (agentId: string | undefined) => {
    if (activeAgentId) {
      cache.set(activeAgentId, entries())
    }
    activeAgentId = agentId
    setEntries(agentId ? (cache.get(agentId) ?? []) : [])
  }

  const hasCache = (agentId: string) => cache.has(agentId)

  const hydrate = (agentId: string, next: ReadonlyArray<TranscriptEntry>) => {
    cache.set(agentId, next)
    if (activeAgentId === agentId) {
      setEntries(next)
    }
  }

  const commit = (c: StreamCommit) => persist(applyCommit(entries(), c))

  return {
    entries,
    hasCache,
    switchAgent,
    hydrate,
    commit,
    dispose() {
      cache.clear()
      activeAgentId = undefined
      setEntries([])
    },
  }
}
