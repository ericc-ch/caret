import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-solid"
import { onMount } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { copySelectedText } from "../lib/selection.ts"
import {
  cancelAtom,
  promptAtom,
  promptStatusAtom,
  transcriptAtom,
} from "../lib/atoms/agent-atoms.ts"
import { AppShell } from "./app-shell.tsx"

export function App() {
  useAtomMount(() => transcriptAtom)

  const promptStatus = useAtomValue(() => promptStatusAtom)
  const runPrompt = useAtomSet(() => promptAtom, { mode: "promise" })
  const runCancel = useAtomSet(() => cancelAtom, { mode: "promise" })

  const renderer = useRenderer()

  useKeyboard((event) => {
    if (event.name === "f12") {
      renderer.console.toggle()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.name === "escape" && promptStatus() === "running") {
      void runCancel(undefined).catch(() => undefined)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!event.ctrl || !event.shift || event.name !== "c") return
    if (!copySelectedText(renderer)) return
    event.preventDefault()
    event.stopPropagation()
  })

  onMount(() => {
    renderer.console.onCopySelection = (text: string) => {
      if (!text) return
      renderer.copyToClipboardOSC52(text)
      renderer.clearSelection()
    }
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    void runPrompt(text).catch(() => undefined)
  }

  return <AppShell promptStatus={promptStatus()} onSubmit={submit} />
}
