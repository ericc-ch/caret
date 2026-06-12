import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { Show } from "solid-js"
import { useTheme } from "../lib/theme.tsx"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const color = () => props.color ?? theme().textMuted

  return (
    <box flexDirection="row" gap={1}>
      <spinner frames={frames} interval={80} color={color()} />
      <Show when={props.children}>
        <text fg={color()}>{props.children}</text>
      </Show>
    </box>
  )
}
