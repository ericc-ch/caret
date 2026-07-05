import { For, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { TranscriptEntry } from "./types.ts"
import { TranscriptEntryView } from "./transcript-entry.tsx"

export function TranscriptPanel(props: { entries: () => ReadonlyArray<TranscriptEntry> }) {
  const dimensions = useTerminalDimensions()
  const showScrollbar = createMemo(() => dimensions().width >= 100)

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
      <For each={props.entries()}>{(entry) => <TranscriptEntryView entry={entry} />}</For>
    </scrollbox>
  )
}
