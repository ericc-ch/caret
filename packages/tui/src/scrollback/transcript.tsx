import { RGBA, TextRenderable, type CliRenderer, type ScrollbackSurface } from "@opentui/core"
import { createScrollbackWriter } from "@opentui/solid"
import type { Theme } from "../lib/theme.tsx"

type StreamKind = "thinking" | "assistant"

type ActiveStream = {
  kind: StreamKind
  surface: ScrollbackSurface
  renderable: TextRenderable
  committedRows: number
}

export type Transcript = {
  writeUser(text: string): void
  writeError(text: string): void
  updateThinking(text: string, done: boolean): void
  updateAssistant(text: string, done: boolean): void
  finish(): void
  dispose(): void
}


export function createTranscript(renderer: CliRenderer, theme: () => Theme): Transcript {
  let active: ActiveStream | undefined
  const surfaces = new Set<ScrollbackSurface>()

  const requestRender = () => {
    renderer.requestRender()
  }

  const destroySurface = (surface: ScrollbackSurface) => {
    if (!surface.isDestroyed) {
      surface.destroy()
    }
    surfaces.delete(surface)
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

    requestRender()
  }

  const createStream = (kind: StreamKind, fg: RGBA): ActiveStream => {
    const surface = renderer.createScrollbackSurface({ startOnNewLine: true })
    surfaces.add(surface)
    const renderable = new TextRenderable(surface.renderContext, {
      id: `caret-transcript-${kind}`,
      content: "",
      width: "100%",
      wrapMode: "word",
      fg,
    })
    surface.root.add(renderable)
    return { kind, surface, renderable, committedRows: 0 }
  }

  const updateStream = (input: { kind: StreamKind; content: string; done: boolean; fg: RGBA }) => {
    if (active?.kind !== input.kind) {
      flushActive(true)
      active = createStream(input.kind, input.fg)
    }

    if (!active) return

    active.renderable.content = input.content
    active.renderable.fg = input.fg
    flushActive(input.done)
  }

  return {
    writeUser(text: string) {
      const resolved = theme()
      renderer.writeToScrollback(
        createScrollbackWriter(
          () => (
            <text wrapMode="word">
              <span style={{ fg: resolved.accent }}>›</span> {text}
            </text>
          ),
          { startOnNewLine: true, trailingNewline: true },
        ),
      )
      requestRender()
    },

    writeError(text: string) {
      const resolved = theme()
      renderer.writeToScrollback(
        createScrollbackWriter(
          () => (
            <text wrapMode="word" fg={resolved.error}>
              {text}
            </text>
          ),
          { startOnNewLine: true, trailingNewline: true },
        ),
      )
      requestRender()
    },

    updateThinking(text: string, done: boolean) {
      const content = text ? `Thinking: ${text}` : "Thinking:"
      const resolved = theme()
      const warning = resolved.warning
      const fg = RGBA.fromValues(warning.r, warning.g, warning.b, resolved.thinkingOpacity)
      updateStream({ kind: "thinking", content, done, fg })
    },

    updateAssistant(text: string, done: boolean) {
      const content = text.trim() || (done ? "" : " ")
      if (!content && done) {
        flushActive(true)
        return
      }
      updateStream({ kind: "assistant", content, done, fg: theme().text })
    },

    finish() {
      flushActive(true)
    },

    dispose() {
      flushActive(true)
      for (const surface of surfaces) {
        destroySurface(surface)
      }
    },
  }
}
