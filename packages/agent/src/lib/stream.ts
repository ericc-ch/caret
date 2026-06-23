import type { Run } from "@cursor/sdk"
import { Effect } from "effect"

export type ExecutorPausePayload = {
  readonly status: "waiting_for_interaction"
  readonly executionId: string
  readonly interaction: {
    readonly message?: string
    readonly instructions?: string
    readonly kind?: string
    readonly url?: string
  }
}

export type StreamRelay = {
  readonly onText?: (chunk: string, full: string) => void
  readonly onPause?: (payload: ExecutorPausePayload) => void
}

function parsePausePayload(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{") || !trimmed.includes("waiting_for_interaction")) return undefined

  try {
    const value = JSON.parse(trimmed) as {
      status?: string
      executionId?: string
      interaction?: ExecutorPausePayload["interaction"]
    }
    if (value.status !== "waiting_for_interaction" || !value.executionId) return undefined
    return {
      status: "waiting_for_interaction" as const,
      executionId: value.executionId,
      interaction: value.interaction ?? {},
    }
  } catch {
    return undefined
  }
}

export function relayStream(run: Run, relay: StreamRelay = {}) {
  return Effect.gen(function* () {
    let assistantText = ""

    yield* Effect.promise(async () => {
      for await (const event of run.stream()) {
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type !== "text" || !block.text) continue
            assistantText += block.text
            relay.onText?.(block.text, assistantText)
          }
          continue
        }

        if (event.type === "tool_call" && event.status === "completed") {
          const result =
            typeof event.result === "string"
              ? event.result
              : event.result === undefined
                ? ""
                : JSON.stringify(event.result)
          const pause = parsePausePayload(result)
          if (pause) relay.onPause?.(pause)
        }
      }
    })

    return { assistantText }
  })
}
