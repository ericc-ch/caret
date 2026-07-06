import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-solid"
import { onMount } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { copySelectedText } from "../lib/selection.ts"
import {
  bootAtom,
  promptAtom,
  promptStatusAtom,
  sessionsAtom,
  transcriptAtom,
} from "../lib/atoms/session-atoms.ts"
import { AppShell } from "./app-shell.tsx"

export function App() {
  useAtomMount(() => sessionsAtom)
  useAtomMount(() => transcriptAtom)
  useAtomMount(() => bootAtom)

  const promptStatus = useAtomValue(() => promptStatusAtom)
  const runBoot = useAtomSet(() => bootAtom, { mode: "promise" })
  const runPrompt = useAtomSet(() => promptAtom, { mode: "promise" })

  const renderer = useRenderer()

  useKeyboard((event) => {
    if (event.name === "f12") {
      renderer.console.toggle()
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
    void runBoot(undefined)
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    void runPrompt(text)
  }

  return <AppShell promptStatus={promptStatus()} onSubmit={submit} />
}
