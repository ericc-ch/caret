import type { KeyBinding, TextareaRenderable } from "@opentui/core"
import { AtomRef } from "effect/unstable/reactivity"
import { createEffect, on, onCleanup } from "solid-js"
import { useTheme } from "../lib/theme.tsx"

const keyBindings = [
  { name: "return", action: "submit" },
  { name: "return", meta: true, action: "newline" },
] satisfies Array<KeyBinding>

export type PromptStatus = "connecting" | "unavailable" | "ready" | "running"

export type PromptRef = {
  readonly focused: boolean
  focus(): void
  blur(): void
}

export const promptRef = AtomRef.make<PromptRef | undefined>(undefined)

export function Prompt(props: { status: PromptStatus; onSubmit: (text: string) => void }) {
  const { theme } = useTheme()
  let textarea: TextareaRenderable | undefined

  const disabled = () => props.status !== "ready"
  const background = () => theme().backgroundElement

  const placeholderText = () => {
    switch (props.status) {
      case "connecting":
        return "Connecting…"
      case "running":
        return "Waiting for response…"
      case "unavailable":
        return "Unavailable"
      default:
        return "Ask anything…"
    }
  }

  const submit = () => {
    if (!textarea || disabled()) return
    const text = textarea.plainText.trim()
    if (!text) return
    textarea.replaceText("")
    props.onSubmit(text)
  }

  const handle = {
    get focused() {
      return textarea?.focused ?? false
    },
    focus() {
      textarea?.focus()
    },
    blur() {
      textarea?.blur()
    },
  }

  createEffect(
    on(
      () => props.status,
      () => {
        if (!textarea || textarea.isDestroyed) return
        if (!textarea.focused) textarea.focus()
      },
    ),
  )

  onCleanup(() => {
    promptRef.set(undefined)
  })

  return (
    <box
      width="100%"
      flexDirection="column"
      backgroundColor={background()}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
      gap={0}
    >
      <text fg={theme().textMuted}>Message</text>
      <textarea
        ref={(value) => {
          textarea = value
          promptRef.set(handle)
        }}
        onMouseDown={(event) => event.target?.focus()}
        flexGrow={1}
        minHeight={1}
        maxHeight={4}
        placeholder={placeholderText()}
        placeholderColor={theme().textMuted}
        textColor={theme().text}
        focusedTextColor={theme().text}
        backgroundColor={background()}
        focusedBackgroundColor={background()}
        cursorColor={disabled() ? background() : theme().text}
        keyBindings={keyBindings}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (disabled()) event.preventDefault()
        }}
      />
    </box>
  )
}
