import { RGBA } from "@opentui/core"
import { Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../lib/theme.tsx"
import { useLayout } from "../context/layout.ts"
import { NavPanel } from "./nav-panel.tsx"
import { SessionHeader } from "./session-header.tsx"
import { ContextRail } from "./context/rail.tsx"
import { TranscriptPanel } from "./transcript/transcript-panel.tsx"
import { Prompt, type PromptStatus } from "../components/prompt.tsx"
import type { TranscriptEntry } from "../lib/transcript.ts"

export function AppShell(props: {
  promptStatus: PromptStatus
  onSubmit: (text: string) => void
  entries: () => ReadonlyArray<TranscriptEntry>
}) {
  const { theme } = useTheme()
  const layout = useLayout()
  const dimensions = useTerminalDimensions()

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme().background}
    >
      <box flexGrow={1} minHeight={0} flexDirection="row" position="relative">
        <Show when={layout.wide() && layout.navOpen()}>
          <NavPanel />
        </Show>

        <box
          flexGrow={1}
          minHeight={0}
          flexDirection="column"
          backgroundColor={theme().background}
          paddingLeft={2}
          paddingRight={2}
          gap={1}
        >
          <SessionHeader />
          <TranscriptPanel entries={props.entries} />
          <box flexShrink={0}>
            <Prompt status={props.promptStatus} onSubmit={props.onSubmit} />
          </box>
        </box>

        <Show when={layout.wide() && layout.contextOpen()}>
          <ContextRail />
        </Show>

        <Show when={!layout.wide() && layout.navOpen()}>
          <box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            alignItems="flex-start"
            backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
          >
            <NavPanel />
          </box>
        </Show>

        <Show when={!layout.wide() && layout.contextOpen()}>
          <box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            alignItems="flex-end"
            backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
          >
            <ContextRail />
          </box>
        </Show>
      </box>
    </box>
  )
}
