import { Schema, type Effect } from "effect"

export type ThreadId = `${string}:${string}`

export type ImageSource =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "bytes"; readonly data: Uint8Array; readonly mimeType: string }

export type InboundPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly source: ImageSource }

export type InboundMeta = {
  readonly channelId: string
  readonly authorId?: string
  readonly messageId?: string
  readonly raw?: unknown
}

export type InboundMessage = {
  readonly threadId: ThreadId
  readonly parts: ReadonlyArray<InboundPart>
  readonly reply: (outbound: OutboundMessage) => Effect.Effect<void>
  readonly meta?: InboundMeta
}

export type OutboundPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly source: ImageSource }

export type OutboundMessage = {
  readonly parts: ReadonlyArray<OutboundPart>
}

export type ChannelPartKind = "text" | "image"

export type ChannelCapabilities = {
  readonly inbound: ReadonlySet<ChannelPartKind>
  readonly outbound: ReadonlySet<ChannelPartKind>
}

export type Channel = {
  readonly id: string
  readonly capabilities: ChannelCapabilities
  readonly start: () => Effect.Effect<void, unknown, unknown>
}

export class ChannelNotConfigured extends Schema.TaggedErrorClass<ChannelNotConfigured>()(
  "ChannelNotConfigured",
  { channelId: Schema.String },
) {}

export class DiscordError extends Schema.TaggedErrorClass<DiscordError>()("DiscordError", {
  cause: Schema.Defect(),
}) {}

export class RunStreamError extends Schema.TaggedErrorClass<RunStreamError>()("RunStreamError", {
  cause: Schema.Defect(),
}) {}
