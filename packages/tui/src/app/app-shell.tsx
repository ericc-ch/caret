import { RGBA } from "@opentui/core"
import { Show, createMemo } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { WIDE_BREAKPOINT } from "../lib/layout.ts"
import { useTheme } from "../lib/theme.tsx"
import { Prompt, type PromptStatus } from "../components/prompt.tsx"
import { TabRail } from "./tab-rail.tsx"
import { TranscriptPanel } from "./transcript/transcript-panel.tsx"

export function AppShell(props: { promptStatus: PromptStatus; onSubmit: (text: string) => void }) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const wide = createMemo(() => dimensions().width >= WIDE_BREAKPOINT)

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      paddingY={1}
      flexDirection="column"
      backgroundColor={theme().background}
    >
      <box flexGrow={1} minHeight={0} flexDirection="row" position="relative">
        <box
          flexGrow={1}
          minHeight={0}
          flexDirection="column"
          backgroundColor={theme().background}
          paddingLeft={2}
          paddingRight={2}
          gap={1}
        >
          <TranscriptPanel />
          <box flexShrink={0}>
            <Prompt status={props.promptStatus} onSubmit={props.onSubmit} />
          </box>
        </box>

        <Show
          when={wide()}
          fallback={
            <box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              alignItems="flex-end"
              backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
            >
              <TabRail />
            </box>
          }
        >
          <TabRail />
        </Show>
      </box>
    </box>
  )
}
