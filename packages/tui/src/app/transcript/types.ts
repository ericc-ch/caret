import { Data } from "effect"

export type StreamCommit = Data.TaggedEnum<{
  User: { readonly text: string }
  Error: { readonly text: string }
  Thinking: { readonly text: string; readonly done: boolean }
  Assistant: { readonly text: string; readonly done: boolean }
}>

export const Commit = Data.taggedEnum<StreamCommit>()

export type TranscriptEntry =
  | { readonly id: string; readonly kind: "user"; readonly text: string }
  | { readonly id: string; readonly kind: "error"; readonly text: string }
  | { readonly id: string; readonly kind: "thinking"; readonly text: string; readonly streaming: boolean }
  | { readonly id: string; readonly kind: "assistant"; readonly text: string; readonly streaming: boolean }

export type TranscriptSink = {
  commit(commit: StreamCommit): void
  dispose(): void
}
