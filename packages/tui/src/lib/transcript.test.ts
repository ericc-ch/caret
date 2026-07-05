import type { AgentMessage } from "@cursor/sdk"
import { describe, expect, it } from "vitest"
import {
  applyCommit,
  Commit,
  entriesFromSdkMessages,
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
})

describe("entriesFromSdkMessages", () => {
  const conversation = [
    {
      message: {
        turn: {
          case: "agentConversationTurn",
          value: {
            userMessage: { text: "What is 2+2?" },
            steps: [
              {
                message: {
                  case: "thinkingMessage",
                  value: { text: "I need to calculate" },
                },
              },
              {
                message: {
                  case: "thinkingMessage",
                  value: { text: "it's simple math" },
                },
              },
              {
                message: {
                  case: "assistantMessage",
                  value: { text: "The answer is " },
                },
              },
              {
                message: {
                  case: "assistantMessage",
                  value: { text: "4." },
                },
              },
            ],
          },
        },
      },
    },
    {
      message: {
        agentConversationTurn: {
          userMessage: { text: "Thanks" },
          steps: [],
        },
      },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: "You're welcome!" }],
      },
    },
  ] as unknown as ReadonlyArray<AgentMessage>

  it("maps persisted SDK messages to ordered transcript entries with deterministic ids", () => {
    expect(entriesFromSdkMessages(conversation)).toEqual([
      { id: "entry-1", kind: "user", text: "What is 2+2?" },
      {
        id: "entry-2",
        kind: "thinking",
        text: "Thinking: I need to calculate\nit's simple math",
        streaming: false,
      },
      { id: "entry-3", kind: "assistant", text: "The answer is 4.", streaming: false },
      { id: "entry-4", kind: "user", text: "Thanks" },
      { id: "entry-5", kind: "assistant", text: "You're welcome!", streaming: false },
    ])
  })

  it("extends replayed entries with live commits using continuing ids", () => {
    const replayed = entriesFromSdkMessages(conversation)
    const extended = applyCommit(replayed, Commit.User({ text: "Follow-up" }))

    expect(extended).toEqual([
      ...replayed,
      { id: "entry-6", kind: "user", text: "Follow-up" },
    ])
  })
})
