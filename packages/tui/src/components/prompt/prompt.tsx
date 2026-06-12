import type { KeyBinding, TextareaRenderable } from "@opentui/core"
import { createEffect, Match, on, onCleanup, Switch } from "solid-js"
import { promptRef } from "../../reactivity/prompt-ref.ts"
import { EmptyBorder, SplitBorder } from "../../lib/border.ts"
import { Spinner } from "../spinner.tsx"
import { useTheme } from "../../lib/theme.tsx"

const keyBindings = [
  { name: "return", action: "submit" },
  { name: "return", meta: true, action: "newline" },
] satisfies Array<KeyBinding>

const placeholders = ["Fix a failing test", "Explain this module", "Refactor for clarity"]

const placeholderExample = placeholders[Math.floor(Math.random() * placeholders.length)]!

const promptBottomCap = {
  ...EmptyBorder,
  horizontal: "▀",
} as const

const promptBottomCapTransparent = {
  ...EmptyBorder,
  horizontal: " ",
} as const

export type PromptStatus = "connecting" | "unavailable" | "ready" | "running"

export type PromptRef = {
  readonly focused: boolean
  focus(): void
  blur(): void
}

export function Prompt(props: { status: PromptStatus; onSubmit: (text: string) => void }) {
  const { theme, syntax } = useTheme()
  let textarea: TextareaRenderable | undefined

  const disabled = () => props.status !== "ready"
  const panelBackground = () => theme().backgroundElement

  const placeholderText = () => {
    switch (props.status) {
      case "connecting":
        return "Connecting…"
      case "running":
        return "Waiting for response…"
      case "unavailable":
        return "Agent unavailable"
      default:
        return `Ask anything… "${placeholderExample}"`
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
    <box width="100%">
      <box
        width="100%"
        border={["left"]}
        borderColor={theme().accent}
        customBorderChars={{
          ...SplitBorder.customBorderChars,
          bottomLeft: "╹",
        }}
      >
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          flexShrink={0}
          backgroundColor={panelBackground()}
          flexGrow={1}
          width="100%"
        >
          <textarea
            ref={(value) => {
              textarea = value
              promptRef.set(handle)
            }}
            onMouseDown={(event) => event.target?.focus()}
            width="100%"
            minHeight={1}
            maxHeight={6}
            placeholder={placeholderText()}
            placeholderColor={theme().textMuted}
            textColor={theme().text}
            focusedTextColor={theme().text}
            focusedBackgroundColor={panelBackground()}
            cursorColor={disabled() ? panelBackground() : theme().text}
            syntaxStyle={syntax()}
            keyBindings={keyBindings}
            onSubmit={submit}
            onKeyDown={(event) => {
              if (disabled()) event.preventDefault()
            }}
          />
        </box>
      </box>
      <box
        height={1}
        border={["left"]}
        borderColor={theme().accent}
        customBorderChars={{
          ...EmptyBorder,
          vertical: panelBackground().a !== 0 ? "╹" : " ",
        }}
      >
        <box
          height={1}
          border={["bottom"]}
          borderColor={panelBackground()}
          customBorderChars={
            panelBackground().a !== 0 ? promptBottomCap : promptBottomCapTransparent
          }
        />
      </box>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <Switch>
          <Match when={props.status === "running" || props.status === "connecting"}>
            <box marginLeft={1}>
              <Spinner color={theme().accent}>
                {props.status === "connecting" ? "Connecting" : "Running"}
              </Spinner>
            </box>
          </Match>
          <Match when={props.status === "ready"}>
            <text fg={theme().textMuted}>enter submit · meta+enter newline</text>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
