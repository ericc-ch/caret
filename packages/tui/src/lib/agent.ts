import type { SDKAgent } from "@cursor/sdk"

export type RunPromptHandlers = {
  onTextDelta: (text: string) => void
  onThinkingDelta: (text: string) => void
  onAssistantText: (text: string) => void
  onThinkingText: (text: string) => void
  onThinkingDone: () => void
}

export async function runPrompt(agent: SDKAgent, prompt: string, handlers: RunPromptHandlers) {
  let sawTextDelta = false
  let sawThinkingDelta = false

  const run = await agent.send(prompt, {
    onDelta: ({ update }) => {
      if (update.type === "text-delta") {
        sawTextDelta = true
        handlers.onTextDelta(update.text)
      }
      if (update.type === "thinking-delta") {
        sawThinkingDelta = true
        handlers.onThinkingDelta(update.text)
      }
      if (update.type === "thinking-completed") {
        handlers.onThinkingDone()
      }
    },
  })

  const stream = (async () => {
    for await (const event of run.stream()) {
      if (event.type === "assistant" && !sawTextDelta) {
        const text = event.message.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("")
        if (text) handlers.onAssistantText(text)
      }
      if (event.type === "thinking" && !sawThinkingDelta && event.text) {
        handlers.onThinkingText(event.text)
      }
    }
  })()

  const result = await run.wait()
  await stream

  if (result.status === "error") {
    const detail = result.result?.trim()
    throw new Error(detail ? `${detail} (${run.id})` : `Run failed (${run.id})`)
  }

  return result
}
