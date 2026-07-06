import { useAtom, useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-solid"
import { createEffect, onCleanup, onMount } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Commit, type TranscriptSink } from "../lib/transcript.ts"
import { formatError } from "../lib/format-error.ts"
import { copySelectedText } from "../lib/selection.ts"
import {
  activeAgentIdAtom,
  bootAtom,
  bootErrorAtom,
  commitTranscript,
  emptyTranscriptState,
  hydrateTranscript,
  loadTranscriptAtom,
  promptAtom,
  promptStatusAtom,
  promptSubmittingAtom,
  sessionListAtom,
  sessionsAtom,
  switchTranscriptAgent,
  transcriptStateAtom,
} from "../lib/atoms/index.ts"
import { sessionInputForAgent } from "../lib/workspace.ts"
import { AppShell } from "./app-shell.tsx"

const loadingTranscripts = new Set<string>()

export function App() {
  useAtomMount(() => sessionsAtom)
  useAtomMount(() => bootAtom)

  const activeAgentId = useAtomValue(() => activeAgentIdAtom)
  const sessions = useAtomValue(() => sessionListAtom)
  const promptStatus = useAtomValue(() => promptStatusAtom)
  const bootError = useAtomValue(() => bootErrorAtom)

  const [, setTranscriptState] = useAtom(() => transcriptStateAtom)
  const setSubmitting = useAtomSet(() => promptSubmittingAtom)

  const runBoot = useAtomSet(() => bootAtom, { mode: "promise" })
  const runLoadTranscript = useAtomSet(() => loadTranscriptAtom, { mode: "promise" })
  const runPrompt = useAtomSet(() => promptAtom, { mode: "promise" })

  const renderer = useRenderer()

  const sink: TranscriptSink = {
    commit(commit) {
      setTranscriptState((state) => commitTranscript(state, commit))
    },
    dispose() {
      setTranscriptState(() => emptyTranscriptState())
    },
  }

  useKeyboard((event) => {
    if (!event.ctrl || !event.shift || event.name !== "c") return
    if (!copySelectedText(renderer)) return
    event.preventDefault()
    event.stopPropagation()
  })

  onMount(() => {
    void runBoot(undefined)
  })

  createEffect(() => {
    const agentId = activeAgentId()
    if (!agentId) {
      setTranscriptState((state) => switchTranscriptAgent(state, undefined))
      return
    }

    let shouldLoad = false
    setTranscriptState((state) => {
      const next = state.activeAgentId === agentId ? state : switchTranscriptAgent(state, agentId)
      shouldLoad = !next.cache.has(agentId) && !loadingTranscripts.has(agentId)
      if (shouldLoad) loadingTranscripts.add(agentId)
      return next
    })

    if (!shouldLoad) return

    const input = sessionInputForAgent(agentId, sessions())
    void runLoadTranscript(input)
      .then((entries) => {
        if (activeAgentId() === agentId) {
          setTranscriptState((current) => hydrateTranscript(current, agentId, entries))
        }
      })
      .catch((cause) => {
        if (activeAgentId() === agentId) {
          setTranscriptState((current) =>
            commitTranscript(current, Commit.Error({ text: formatError(cause) })),
          )
        }
      })
      .finally(() => {
        loadingTranscripts.delete(agentId)
      })
  })

  createEffect(() => {
    const error = bootError()
    if (error) {
      setTranscriptState((state) => commitTranscript(state, Commit.Error({ text: error })))
    }
  })

  onCleanup(() => {
    sink.dispose()
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    setSubmitting(true)
    void runPrompt({ text, sink }).finally(() => setSubmitting(false))
  }

  return <AppShell promptStatus={promptStatus()} onSubmit={submit} />
}
