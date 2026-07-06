import type { SDKAgentInfo } from "@cursor/sdk"
import type { AgentId } from "../services/session.ts"
import { localAgentCwd, projectInitial, type ProjectCwd } from "./workspace.ts"
import { truncatePath } from "./layout.ts"

export function tabDisplayTitle(info: Pick<SDKAgentInfo, "name" | "summary" | "agentId">) {
  if (info.name.trim()) return info.name
  if (info.summary.trim()) return info.summary
  return info.agentId.slice(0, 8)
}

export type TabViewModel = {
  readonly agentId: AgentId
  readonly title: string
  readonly cwdLabel: string
  readonly projectInitial: string
  readonly isActive: boolean
}

export function toTabViewModel(
  info: SDKAgentInfo,
  activeAgentId: AgentId | undefined,
  fallbackCwd: ProjectCwd,
) {
  const cwd = localAgentCwd(info) ?? fallbackCwd
  return {
    agentId: info.agentId,
    title: tabDisplayTitle(info),
    cwdLabel: truncatePath(cwd, 18),
    projectInitial: projectInitial(cwd),
    isActive: info.agentId === activeAgentId,
  }
}

export function toTabViewModels(
  tabs: ReadonlyArray<SDKAgentInfo>,
  activeAgentId: AgentId | undefined,
  fallbackCwd: ProjectCwd,
) {
  return tabs.map((tab) => toTabViewModel(tab, activeAgentId, fallbackCwd))
}
