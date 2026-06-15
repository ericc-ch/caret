import { Data } from "effect"

export type StreamCommit = Data.TaggedEnum<{
  User: { readonly text: string }
  Error: { readonly text: string }
  Thinking: { readonly text: string; readonly done: boolean }
  Assistant: { readonly text: string; readonly done: boolean }
}>

export const Commit = Data.taggedEnum<StreamCommit>()
