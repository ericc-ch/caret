import { RGBA } from "@opentui/core"
import { useTheme } from "../../lib/theme.tsx"
import type { TranscriptEntry } from "../../lib/transcript.ts"

export function TranscriptEntryView(props: { entry: TranscriptEntry }) {
  const { theme, syntax } = useTheme()
  const entry = props.entry

  if (entry.kind === "user") {
    return (
      <text wrapMode="word" marginTop={1}>
        <span style={{ fg: theme().accent }}>›</span> {entry.text}
      </text>
    )
  }

  if (entry.kind === "error") {
    return (
      <text wrapMode="word" fg={theme().error} marginTop={1}>
        {entry.text}
      </text>
    )
  }

  if (entry.kind === "thinking") {
    const warning = theme().warning
    const fg = RGBA.fromValues(warning.r, warning.g, warning.b, theme().thinkingOpacity)
    return (
      <text wrapMode="word" marginTop={1} fg={fg}>
        {entry.text}
      </text>
    )
  }

  if (entry.kind === "tool") {
    const tool = entry
    const color = () => {
      switch (tool.status) {
        case "running":
          return theme().warning
        case "error":
          return theme().error
        case "completed":
          return theme().textMuted
        default:
          return theme().textMuted
      }
    }
    const marker = () => {
      switch (tool.status) {
        case "running":
          return "..."
        case "error":
          return "x"
        case "completed":
          return "✓"
        default:
          return "-"
      }
    }
    return (
      <box flexDirection="column" marginTop={1} paddingLeft={1}>
        <text wrapMode="word" fg={color()}>
          {marker()} {tool.toolName} {tool.summary}
        </text>
        {tool.status === "error" && tool.outputPreview ? (
          <text wrapMode="word" fg={theme().error} marginLeft={2}>
            {tool.outputPreview}
          </text>
        ) : null}
      </box>
    )
  }

  if (entry.kind === "assistant") {
    const assistant = entry
    return (
      <box paddingLeft={1} marginTop={1} flexShrink={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={assistant.streaming}
          internalBlockMode="top-level"
          content={assistant.text}
          tableOptions={{ style: "grid" }}
          fg={theme().markdownText}
          bg={theme().background}
          width="100%"
        />
      </box>
    )
  }

  return null
}
