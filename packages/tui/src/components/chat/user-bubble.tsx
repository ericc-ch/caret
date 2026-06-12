import { SplitBorder } from "../../ui/border.ts"
import { useTheme } from "../../lib/theme.tsx"

export function UserBubble(props: { text: string; index: number }) {
  const { theme } = useTheme()

  return (
    <box
      border={["left"]}
      borderColor={theme().accent}
      customBorderChars={SplitBorder.customBorderChars}
      marginTop={props.index === 0 ? 0 : 1}
      flexShrink={0}
    >
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={theme().backgroundPanel}>
        <text fg={theme().text}>{props.text}</text>
      </box>
    </box>
  )
}
