import { Context, Effect, Layer } from "effect"
import { RGBA, TextRenderable, type CliRenderer, type ScrollbackSurface } from "@opentui/core"
import { createScrollbackWriter } from "@opentui/solid"
import type { Theme } from "../lib/theme.tsx"

export type StreamCommit =
  | { readonly _tag: "User"; readonly text: string }
  | { readonly _tag: "Error"; readonly text: string }
  | { readonly _tag: "Thinking"; readonly text: string }
  | { readonly _tag: "Assistant"; readonly text: string }

type StreamKind = "thinking" | "assistant"

type ActiveStream = {
  kind: StreamKind
  surface: ScrollbackSurface
  renderable: TextRenderable
  committedRows: number
}

function createScrollback(renderer: CliRenderer, theme: () => Theme) {
  let active: ActiveStream | undefined
  let assistantText = ""

  const destroySurface = (surface: ScrollbackSurface) => {
    if (!surface.isDestroyed) {
      surface.destroy()
    }
  }

  const flushActive = (done: boolean) => {
    if (!active) return

    active.surface.render()
    const targetRows = done
      ? active.surface.height
      : Math.max(active.committedRows, active.surface.height - 1)

    if (targetRows > active.committedRows) {
      active.surface.commitRows(active.committedRows, targetRows, {
        trailingNewline: done && targetRows === active.surface.height,
      })
      active.committedRows = targetRows
    }

    if (done) {
      destroySurface(active.surface)
      active = undefined
    }

    renderer.requestRender()
  }

  const createStream = (kind: StreamKind, fg: RGBA) => {
    const surface = renderer.createScrollbackSurface({ startOnNewLine: true })
    const renderable = new TextRenderable(surface.renderContext, {
      id: `caret-scrollback-${kind}`,
      content: "",
      width: "100%",
      wrapMode: "word",
      fg,
    })
    surface.root.add(renderable)
    return { kind, surface, renderable, committedRows: 0 }
  }

  const updateStream = (kind: StreamKind, content: string, fg: RGBA) => {
    if (active?.kind !== kind) {
      flushActive(true)
      if (kind === "assistant") {
        assistantText = ""
      }
      active = createStream(kind, fg)
    }

    if (kind === "assistant") {
      assistantText += content
      active.renderable.content = assistantText.trim() || " "
    } else {
      active.renderable.content = content
    }

    active.renderable.fg = fg
    flushActive(false)
  }

  const appendStatic = (render: (resolved: Theme) => unknown) => {
    flushActive(true)
    const resolved = theme()
    renderer.writeToScrollback(
      createScrollbackWriter(() => render(resolved), { startOnNewLine: true, trailingNewline: true })
    )
    renderer.requestRender()
  }

  const finish = () => flushActive(true)

  return {
    append(commit: StreamCommit) {
      switch (commit._tag) {
        case "User":
          appendStatic((resolved) => (
            <text wrapMode="word">
              <span style={{ fg: resolved.accent }}>›</span> {commit.text}
            </text>
          ))
          break
        case "Error":
          appendStatic((resolved) => (
            <text wrapMode="word" fg={resolved.error}>
              {commit.text}
            </text>
          ))
          break
        case "Thinking": {
          const resolved = theme()
          const warning = resolved.warning
          const fg = RGBA.clone(warning)
          fg.a = resolved.thinkingOpacity
          const content = commit.text ? `Thinking: ${commit.text}` : "Thinking:"
          updateStream("thinking", content, fg)
          break
        }
        case "Assistant":
          updateStream("assistant", commit.text, theme().text)
          break
        default: {
          const _exhaustive: never = commit
          void _exhaustive
        }
      }
    },

    finish,
    dispose: finish,
  }
}

export class Scrollback extends Context.Service<
  Scrollback,
  ReturnType<typeof createScrollback>
>()("@caret/Scrollback") {
  static readonly makeLayer = (renderer: CliRenderer, theme: () => Theme) =>
    Layer.effect(
      Scrollback,
      Effect.acquireRelease(
        Effect.sync(() => createScrollback(renderer, theme)),
        (scrollback) => Effect.sync(() => scrollback.dispose())
      )
    )
}
