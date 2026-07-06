import { Data, Match } from "effect"

export type StreamCommit = Data.TaggedEnum<{
  User: { readonly text: string }
  Error: { readonly text: string }
  Thinking: { readonly text: string; readonly done: boolean }
  Assistant: { readonly text: string; readonly done: boolean }
  Tool: {
    readonly callId: string
    readonly name: string
    readonly status: "running" | "completed" | "error"
    readonly args?: unknown
    readonly result?: unknown
    readonly truncated?: {
      readonly args?: boolean
      readonly result?: boolean
    }
  }
}>
export const Commit = Data.taggedEnum<StreamCommit>()

export type TranscriptEntry =
  | { readonly id: string; readonly kind: "user"; readonly text: string }
  | { readonly id: string; readonly kind: "error"; readonly text: string }
  | { readonly id: string; readonly kind: "thinking"; readonly text: string; readonly streaming: boolean }
  | { readonly id: string; readonly kind: "assistant"; readonly text: string; readonly streaming: boolean }
  | {
      readonly id: string
      readonly kind: "tool"
      readonly toolName: string
      readonly status: "running" | "completed" | "error"
      readonly summary: string
      readonly inputPreview?: string
      readonly outputPreview?: string
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

function compactString(value: unknown, maxLength = 120) {
  if (value === undefined || value === null) return undefined

  const text = typeof value === "string" ? value : safeJson(value)

  if (!text) return undefined

  const singleLine = text.replaceAll(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, Math.max(0, maxLength - 1))}…`
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 0)
  } catch {
    return String(value)
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function displayToolName(name: string) {
  const last = name.split(".").at(-1)
  return last || name
}

function summarizeTool(name: string, args: unknown) {
  const tool = displayToolName(name)
  const input = readRecord(args)

  switch (tool) {
    case "Shell":
      return readString(input["command"]) ?? "shell"
    case "ReadFile":
      return readString(input["path"]) ?? "read file"
    case "ApplyPatch":
      return "apply patch"
    case "TodoWrite": {
      const todos = input["todos"]
      return Array.isArray(todos) ? `${todos.length} todo${todos.length === 1 ? "" : "s"}` : "update todos"
    }
    case "WebSearch":
      return readString(input["search_term"]) ?? readString(input["query"]) ?? "search web"
    case "WebFetch":
      return readString(input["url"]) ?? "fetch URL"
    case "Glob":
      return readString(input["glob_pattern"]) ?? "find files"
    case "rg":
      return readString(input["pattern"]) ?? "search content"
    case "Delete":
      return readString(input["path"]) ?? "delete file"
    case "EditNotebook":
      return readString(input["target_notebook"]) ?? "edit notebook"
    case "GenerateImage":
      return readString(input["filename"]) ?? readString(input["description"]) ?? "generate image"
    case "AskQuestion":
      return readString(input["title"]) ?? "ask question"
    default:
      return compactString(args, 80) ?? tool
  }
}

function upsertTool(
  entries: ReadonlyArray<TranscriptEntry>,
  input: Extract<StreamCommit, { _tag: "Tool" }>,
): ReadonlyArray<TranscriptEntry> {
  const id = `tool-${input.callId}`
  const inputPreview = compactString(input.args)
  const outputPreview = compactString(input.result)
  const entry: TranscriptEntry = {
    id,
    kind: "tool",
    toolName: displayToolName(input.name),
    status: input.status,
    summary: summarizeTool(input.name, input.args),
    ...(inputPreview ? { inputPreview } : {}),
    ...(outputPreview ? { outputPreview } : {}),
  }
  const index = entries.findIndex((item) => item.id === id)
  if (index < 0) return [...entries, entry]
  return [...entries.slice(0, index), entry, ...entries.slice(index + 1)]
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
    Tool: (input) => upsertTool(entries, input),
  })(commit)
}
