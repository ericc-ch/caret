import type { AgentMessage } from "@cursor/sdk"
import { Data, Match } from "effect"

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

const entryIdPattern = /^entry-(\d+)$/

function nextEntryId(entries: ReadonlyArray<TranscriptEntry>) {
  let max = 0
  for (const entry of entries) {
    const match = entryIdPattern.exec(entry.id)
    if (match) {
      const n = Number(match[1])
      if (n > max) max = n
    }
  }
  return `entry-${max + 1}`
}

function upsertStreaming(
  entries: ReadonlyArray<TranscriptEntry>,
  next: { kind: "thinking" | "assistant"; text: string; streaming: boolean },
) {
  const last = entries.at(-1)
  if (last?.kind === next.kind && last.streaming) {
    return [...entries.slice(0, -1), { ...last, text: next.text, streaming: next.streaming }]
  }
  return [...entries, { id: nextEntryId(entries), ...next }]
}

export function applyCommit(
  entries: ReadonlyArray<TranscriptEntry>,
  commit: StreamCommit,
): ReadonlyArray<TranscriptEntry> {
  return Match.typeTags<StreamCommit>()({
    User: ({ text }) => [...entries, { id: nextEntryId(entries), kind: "user" as const, text }],
    Error: ({ text }) => [...entries, { id: nextEntryId(entries), kind: "error" as const, text }],
    Thinking: ({ text, done }) => {
      const content = text ? `Thinking: ${text}` : "Thinking:"
      return upsertStreaming(entries, { kind: "thinking", text: content, streaming: !done })
    },
    Assistant: ({ text, done }) => {
      const content = text.trim() || (done ? "" : " ")
      if (!content && done) {
        const last = entries.at(-1)
        if (last?.kind === "assistant" && last.streaming) {
          return entries.slice(0, -1)
        }
        return entries
      }
      return upsertStreaming(entries, { kind: "assistant", text: content, streaming: !done })
    },
  })(commit)
}

type OneOf = {
  readonly case?: string
  readonly value?: unknown
}

function readOneOf(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  const oneof = value as OneOf
  if (typeof oneof.case === "string" && "value" in oneof) {
    return { case: oneof.case, value: oneof.value }
  }
  return undefined
}

function readTurn(message: unknown) {
  if (!message || typeof message !== "object") return undefined

  const oneof = readOneOf((message as { turn?: unknown }).turn)
  if (oneof?.case === "agentConversationTurn" && oneof.value && typeof oneof.value === "object") {
    return oneof.value
  }

  const turn = (message as { agentConversationTurn?: unknown }).agentConversationTurn
  return turn && typeof turn === "object" ? turn : undefined
}

function readUserText(message: unknown) {
  const turn = readTurn(message)
  if (!turn) return undefined
  const userMessage = (turn as { userMessage?: unknown }).userMessage
  if (!userMessage || typeof userMessage !== "object") return undefined
  const text = (userMessage as { text?: unknown }).text
  return typeof text === "string" && text.length > 0 ? text : undefined
}

function readSteps(message: unknown) {
  const turn = readTurn(message)
  if (!turn) return []
  const steps = (turn as { steps?: unknown }).steps
  return Array.isArray(steps) ? steps : []
}

function readStepPart(step: unknown, caseName: string) {
  if (!step || typeof step !== "object") return undefined

  const oneof = readOneOf((step as { message?: unknown }).message)
  if (oneof?.case === caseName && oneof.value && typeof oneof.value === "object") {
    const text = (oneof.value as { text?: unknown }).text
    return typeof text === "string" && text.length > 0 ? text : undefined
  }

  const direct = (step as Record<string, unknown>)[caseName]
  if (!direct || typeof direct !== "object") return undefined
  const text = (direct as { text?: unknown }).text
  return typeof text === "string" && text.length > 0 ? text : undefined
}

function readTopLevelAssistantText(message: unknown) {
  if (!message || typeof message !== "object") return undefined
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  const text = content
    .flatMap((block) =>
      block && typeof block === "object" && (block as { type?: unknown }).type === "text"
        ? [(block as { text?: unknown }).text]
        : [],
    )
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("")
  return text || undefined
}

export function entriesFromSdkMessages(messages: ReadonlyArray<AgentMessage>) {
  const commits: Array<StreamCommit> = []

  for (const message of messages) {
    const userText = readUserText(message.message)
    if (userText) {
      commits.push(Commit.User({ text: userText }))
    }

    const thinkingParts: Array<string> = []
    const assistantParts: Array<string> = []

    for (const step of readSteps(message.message)) {
      const thinking = readStepPart(step, "thinkingMessage")
      if (thinking) thinkingParts.push(thinking)

      const assistant = readStepPart(step, "assistantMessage")
      if (assistant) assistantParts.push(assistant)
    }

    if (thinkingParts.length > 0) {
      commits.push(Commit.Thinking({ text: thinkingParts.join("\n"), done: true }))
    }

    const assistantText =
      assistantParts.join("") || (message.type === "assistant" ? readTopLevelAssistantText(message.message) : undefined)
    if (assistantText) {
      commits.push(Commit.Assistant({ text: assistantText, done: true }))
    }
  }

  return commits.reduce(
    (entries, commit) => applyCommit(entries, commit),
    [] as ReadonlyArray<TranscriptEntry>,
  )
}
