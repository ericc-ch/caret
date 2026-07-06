import { describe, expect, it } from "vitest"
import {
  applyCommit,
  Commit,
  type StreamCommit,
  type TranscriptEntry,
} from "./transcript.ts"

function fold(commits: ReadonlyArray<StreamCommit>): ReadonlyArray<TranscriptEntry> {
  let entries: ReadonlyArray<TranscriptEntry> = []
  for (const commit of commits) {
    entries = applyCommit(entries, commit)
  }
  return entries
}

describe("applyCommit", () => {
  it("folds a live streaming sequence into one entry per role with final texts and no streaming", () => {
    const entries = fold([
      Commit.User({ text: "Hello" }),
      Commit.Thinking({ text: "Let me think", done: false }),
      Commit.Thinking({ text: "Let me think more", done: true }),
      Commit.Assistant({ text: "Hel", done: false }),
      Commit.Assistant({ text: "Hello", done: false }),
      Commit.Assistant({ text: "Hello world", done: true }),
    ])

    expect(entries).toEqual([
      { id: "entry-1", kind: "user", text: "Hello" },
      { id: "entry-2", kind: "thinking", text: "Thinking: Let me think more", streaming: false },
      { id: "entry-3", kind: "assistant", text: "Hello world", streaming: false },
    ])
  })

  it("upserts streaming entries in place and allocates a new id after a completed stream", () => {
    const afterFirst = applyCommit([], Commit.Thinking({ text: "a", done: false }))
    const afterSecond = applyCommit(afterFirst, Commit.Thinking({ text: "ab", done: false }))
    const afterDone = applyCommit(afterSecond, Commit.Thinking({ text: "abc", done: true }))
    const afterFresh = applyCommit(afterDone, Commit.Thinking({ text: "next", done: false }))

    expect(afterSecond[0]?.id).toBe("entry-1")
    expect(afterDone[0]?.id).toBe("entry-1")
    expect(afterFresh).toEqual([
      { id: "entry-1", kind: "thinking", text: "Thinking: abc", streaming: false },
      { id: "entry-2", kind: "thinking", text: "Thinking: next", streaming: true },
    ])
  })

  it("removes a placeholder streaming assistant on empty done and is a no-op without one", () => {
    const withPlaceholder = fold([
      Commit.Assistant({ text: "", done: false }),
      Commit.Assistant({ text: "", done: true }),
    ])
    expect(withPlaceholder).toEqual([])

    const withUser = fold([
      Commit.User({ text: "Hi" }),
      Commit.Assistant({ text: "", done: true }),
    ])
    expect(withUser).toEqual([{ id: "entry-1", kind: "user", text: "Hi" }])
  })

  it("does not mutate the input entries array", () => {
    const original: ReadonlyArray<TranscriptEntry> = [
      { id: "entry-1", kind: "user", text: "Hi" },
    ]
    const snapshot = [...original]

    applyCommit(original, Commit.Assistant({ text: "Reply", done: true }))
    applyCommit(original, Commit.Assistant({ text: "Reply", done: true }))

    expect(original).toEqual(snapshot)
  })

  it("upserts tool calls by call id with compact known-tool summaries", () => {
    const running = applyCommit(
      [],
      Commit.Tool({
        callId: "call-1",
        name: "functions.Shell",
        status: "running",
        args: { command: "bun run check" },
      }),
    )
    const completed = applyCommit(
      running,
      Commit.Tool({
        callId: "call-1",
        name: "functions.Shell",
        status: "completed",
        args: { command: "bun run check" },
        result: "ok",
      }),
    )

    expect(completed).toEqual([
      {
        id: "tool-call-1",
        kind: "tool",
        toolName: "Shell",
        status: "completed",
        summary: "bun run check",
        inputPreview: "{\"command\":\"bun run check\"}",
        outputPreview: "ok",
      },
    ])
  })
})
