import { RGBA } from "@opentui/core"
import { Show, createMemo } from "solid-js"
import { Spinner } from "../spinner.tsx"
import { useTheme } from "../../lib/theme.tsx"

export function ThinkingBubble(props: { text: string; streaming: boolean }) {
  const { theme } = useTheme()
  const text = createMemo(() => (props.streaming ? props.text : props.text.trim()))
  const color = createMemo(() => {
    const warning = theme().warning
    if (!props.streaming) return warning
    return RGBA.fromValues(warning.r, warning.g, warning.b, theme().thinkingOpacity)
  })

  return (
    <Show when={text() || props.streaming}>
      <box paddingLeft={3} marginTop={1} flexShrink={0}>
        <Show
          when={props.streaming}
          fallback={
            <text fg={color()} wrapMode="none">
              <span>Thought</span>
              <Show when={text()}>
                <span>: {text()}</span>
              </Show>
            </text>
          }
        >
          <Spinner color={color()}>
            {text() ? `Thinking: ${text()}` : "Thinking"}
          </Spinner>
        </Show>
      </box>
    </Show>
  )
}
