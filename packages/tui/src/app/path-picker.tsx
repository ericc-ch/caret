import { RGBA, TextAttributes, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../lib/theme.tsx"

export function PathPicker(props: {
  error?: string | undefined
  onSubmit: (path: string) => void
  onCancel: () => void
}) {
  const { theme } = useTheme()
  let textarea: TextareaRenderable | undefined

  const submit = () => {
    if (!textarea) return
    const path = textarea.plainText.trim()
    if (!path) return
    props.onSubmit(path)
  }

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems="center"
      justifyContent="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 80)}
    >
      <box
        width={48}
        flexDirection="column"
        backgroundColor={theme().backgroundPanel}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        <text fg={theme().text} attributes={TextAttributes.BOLD}>
          New tab in directory
        </text>
        <text fg={theme().textMuted}>Path (e.g. ~/projects/my-app)</text>
        <textarea
          ref={(value) => {
            textarea = value
          }}
          width="100%"
          height={3}
          focused
          backgroundColor={theme().backgroundElement}
          textColor={theme().text}
          placeholder="~/…"
          onSubmit={submit}
        />
        {props.error ? <text fg={theme().error}>{props.error}</text> : null}
        <box flexDirection="row" gap={2}>
          <text fg={theme().accent} onMouseUp={submit}>
            Open
          </text>
          <text fg={theme().textMuted} onMouseUp={props.onCancel}>
            Cancel
          </text>
        </box>
      </box>
    </box>
  )
}
