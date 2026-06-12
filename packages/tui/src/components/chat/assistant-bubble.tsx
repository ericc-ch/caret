import { Show, createMemo } from "solid-js"
import { useTheme } from "../../lib/theme.tsx"

export function AssistantBubble(props: { text: string; streaming: boolean }) {
  const { theme, syntax } = useTheme()
  const content = createMemo(() => {
    const text = props.streaming ? props.text : props.text.trim()
    return text || (props.streaming ? " " : "")
  })

  return (
    <Show when={content()}>
      <box paddingLeft={3} marginTop={1} flexShrink={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={props.streaming}
          internalBlockMode="top-level"
          content={content()}
          tableOptions={{ style: "grid" }}
          fg={theme().markdownText}
          bg={theme().background}
        />
      </box>
    </Show>
  )
}
