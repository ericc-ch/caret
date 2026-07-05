import { Match } from "effect"
import { createSignal } from "solid-js"
import { type StreamCommit, type TranscriptEntry, type TranscriptSink } from "./types.ts"

let nextId = 0

function entryId(): string {
  nextId += 1
  return `entry-${nextId}`
}

export function createTranscriptStore(): TranscriptSink & { entries: () => ReadonlyArray<TranscriptEntry> } {
  const [entries, setEntries] = createSignal<ReadonlyArray<TranscriptEntry>>([])

  const upsertStreaming = (kind: "thinking" | "assistant", text: string, streaming: boolean) => {
    setEntries((current) => {
      const last = current.at(-1)
      if (last?.kind === kind && last.streaming) {
        return [...current.slice(0, -1), { ...last, text, streaming }]
      }
      return [...current, { id: entryId(), kind, text, streaming }]
    })
  }

  const commit = Match.typeTags<StreamCommit>()({
    User: ({ text }) => {
      setEntries((current) => [...current, { id: entryId(), kind: "user", text }])
    },
    Error: ({ text }) => {
      setEntries((current) => [...current, { id: entryId(), kind: "error", text }])
    },
    Thinking: ({ text, done }) => {
      const content = text ? `Thinking: ${text}` : "Thinking:"
      upsertStreaming("thinking", content, !done)
    },
    Assistant: ({ text, done }) => {
      const content = text.trim() || (done ? "" : " ")
      if (!content && done) {
        setEntries((current) => {
          const last = current.at(-1)
          if (last?.kind === "assistant" && last.streaming) {
            return current.slice(0, -1)
          }
          return current
        })
        return
      }
      upsertStreaming("assistant", content, !done)
    },
  })

  return {
    entries,
    commit,
    dispose() {
      setEntries([])
    },
  }
}

