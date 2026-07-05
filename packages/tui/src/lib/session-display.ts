import type { SDKAgentInfo } from "@cursor/sdk"

export const DEFAULT_SESSION_NAME = "General chat"

export function sessionDisplayTitle(info: Pick<SDKAgentInfo, "name" | "summary" | "agentId">) {
  if (info.name.trim()) return info.name
  if (info.summary.trim()) return info.summary
  return info.agentId.slice(0, 8)
}

export function activeSessionTitle(
  sessions: ReadonlyArray<SDKAgentInfo>,
  activeId: string | undefined,
) {
  if (!activeId) return DEFAULT_SESSION_NAME
  const item = sessions.find((entry) => entry.agentId === activeId)
  return item ? sessionDisplayTitle(item) : DEFAULT_SESSION_NAME
}
