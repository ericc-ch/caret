import { RGBA } from "@opentui/core"
import { Match, Switch } from "solid-js"
import { useTheme } from "../../lib/theme.tsx"
import type { TranscriptEntry } from "./types.ts"

export function TranscriptEntryView(props: { entry: TranscriptEntry }) {
  const { theme, syntax } = useTheme()

  return (
    <Switch>
      <Match when={props.entry.kind === "user"}>
        <text wrapMode="word" marginTop={1}>
          <span style={{ fg: theme().accent }}>›</span>{" "}
          {(props.entry as Extract<TranscriptEntry, { kind: "user" }>).text}
        </text>
      </Match>

      <Match when={props.entry.kind === "error"}>
        <text wrapMode="word" fg={theme().error} marginTop={1}>
          {(props.entry as Extract<TranscriptEntry, { kind: "error" }>).text}
        </text>
      </Match>

      <Match when={props.entry.kind === "thinking"}>
        <text
          wrapMode="word"
          marginTop={1}
          fg={(() => {
            const warning = theme().warning
            return RGBA.fromValues(warning.r, warning.g, warning.b, theme().thinkingOpacity)
          })()}
        >
          {(props.entry as Extract<TranscriptEntry, { kind: "thinking" }>).text}
        </text>
      </Match>

      <Match when={props.entry.kind === "assistant"}>
        <box paddingLeft={1} marginTop={1} flexShrink={0}>
          <markdown
            syntaxStyle={syntax()}
            streaming={(props.entry as Extract<TranscriptEntry, { kind: "assistant" }>).streaming}
            internalBlockMode="top-level"
            content={(props.entry as Extract<TranscriptEntry, { kind: "assistant" }>).text}
            tableOptions={{ style: "grid" }}
            fg={theme().markdownText}
            bg={theme().background}
            width="100%"
          />
        </box>
      </Match>
    </Switch>
  )
}
