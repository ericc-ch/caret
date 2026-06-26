import type { Effect } from "effect"

export type ChannelMessage = {
  readonly threadId: string
  readonly text: string
  readonly post: (text: string) => Effect.Effect<void>
}
