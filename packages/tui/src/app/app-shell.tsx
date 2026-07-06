import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../lib/theme.tsx"
import { Prompt, type PromptStatus } from "../components/prompt.tsx"
import { TranscriptPanel } from "./transcript/transcript-panel.tsx"

export function AppShell(props: { promptStatus: PromptStatus; onSubmit: (text: string) => void }) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

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
      </box>
    </box>
  )
}
