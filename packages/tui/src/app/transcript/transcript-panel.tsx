import { For, createMemo } from "solid-js"
import { useAtomValue } from "@effect/atom-solid"
import { useTerminalDimensions } from "@opentui/solid"
import { transcriptEntriesAtom } from "../../lib/atoms/session-atoms.ts"
import { WIDE_BREAKPOINT } from "../../lib/layout.ts"
import { TranscriptEntryView } from "./transcript-entry.tsx"

export function TranscriptPanel() {
  const dimensions = useTerminalDimensions()
  const entries = useAtomValue(() => transcriptEntriesAtom)
  const showScrollbar = createMemo(() => dimensions().width >= WIDE_BREAKPOINT)

  return (
    <scrollbox
      flexGrow={1}
      minHeight={0}
      stickyScroll
      stickyStart="bottom"
      viewportOptions={{ paddingRight: showScrollbar() ? 1 : 0 }}
      verticalScrollbarOptions={{
        paddingLeft: 1,
        visible: showScrollbar(),
      }}
    >
      <box height={1} />
      <For each={entries()}>{(entry) => <TranscriptEntryView entry={entry} />}</For>
    </scrollbox>
  )
}
