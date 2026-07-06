import type { SDKAgentInfo } from "@cursor/sdk"
import path from "node:path"
import type { AgentId } from "../services/session.ts"
import { truncatePath } from "./layout.ts"

export type SessionLabel = {
  readonly agentId: AgentId
  readonly title: string
  readonly cwdLabel: string
  readonly projectInitial: string
  readonly isActive: boolean
}

function sessionCwd(info: SDKAgentInfo, fallbackCwd: string) {
  return "cwd" in info ? (info.cwd ?? fallbackCwd) : fallbackCwd
}

function projectName(cwd: string) {
  return path.basename(cwd) || cwd
}

function projectInitial(cwd: string) {
  const name = projectName(cwd)
  return name ? name[0]!.toUpperCase() : "?"
}

function sessionDisplayTitle(info: Pick<SDKAgentInfo, "name" | "summary" | "agentId">) {
  if (info.name.trim()) return info.name
  if (info.summary.trim()) return info.summary
  return info.agentId.slice(0, 8)
}

export function toSessionLabel(
  info: SDKAgentInfo,
  activeAgentId: AgentId | undefined,
  fallbackCwd: string,
): SessionLabel {
  const cwd = sessionCwd(info, fallbackCwd)
  return {
    agentId: info.agentId,
    title: sessionDisplayTitle(info),
    cwdLabel: truncatePath(cwd, 18),
    projectInitial: projectInitial(cwd),
    isActive: info.agentId === activeAgentId,
  }
}

export function toSessionLabels(
  sessions: ReadonlyArray<SDKAgentInfo>,
  activeAgentId: AgentId | undefined,
  fallbackCwd: string,
) {
  return sessions.map((session) => toSessionLabel(session, activeAgentId, fallbackCwd))
}
