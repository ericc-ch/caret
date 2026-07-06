import type { SDKAgentInfo } from "@cursor/sdk"
import { access } from "node:fs/promises"
import { execFile } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export type ProjectCwd = string

export type ResolvePathResult =
  | { readonly ok: true; readonly path: ProjectCwd }
  | { readonly ok: false; readonly error: string }

export async function resolveGitRoot(cwd = process.cwd()) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd })
    const root = stdout.trim()
    return root || undefined
  } catch {
    return undefined
  }
}

export async function seedOpenedCwds(startCwd = process.cwd()) {
  const roots = new Set<ProjectCwd>([path.resolve(startCwd), packageRoot])
  const gitRoot = await resolveGitRoot(startCwd)
  if (gitRoot) roots.add(path.resolve(gitRoot))
  return [...roots]
}

export async function resolveDefaultSdkCwd(cwd = process.cwd()) {
  return (await resolveGitRoot(cwd)) ?? path.resolve(cwd)
}

export function localAgentCwd(info: SDKAgentInfo) {
  return "cwd" in info ? info.cwd : undefined
}

export function agentSessionInput(agentId: string, cwd?: ProjectCwd) {
  return cwd === undefined ? { agentId } : { agentId, cwd }
}

export function sessionInputForAgent(
  agentId: string,
  sessions: ReadonlyArray<SDKAgentInfo>,
) {
  const item = sessions.find((entry) => entry.agentId === agentId)
  return agentSessionInput(agentId, item ? localAgentCwd(item) : undefined)
}

export function resolveUserPath(input: string, base = process.cwd()): ResolvePathResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: "Path is required" }

  const expanded =
    trimmed.startsWith("~") && process.env["HOME"]
      ? path.join(process.env["HOME"], trimmed.slice(1))
      : trimmed

  const resolved = path.resolve(base, expanded)
  if (!path.isAbsolute(resolved)) {
    return { ok: false, error: "Path must resolve to an absolute directory" }
  }
  return { ok: true, path: resolved }
}

export async function validateProjectDirectory(resolved: ProjectCwd): Promise<ResolvePathResult> {
  try {
    await access(resolved)
    return { ok: true, path: resolved }
  } catch {
    return { ok: false, error: `Directory not found: ${resolved}` }
  }
}

export async function resolveAndValidateProjectPath(input: string): Promise<ResolvePathResult> {
  const resolved = resolveUserPath(input)
  if (!resolved.ok) return resolved
  return validateProjectDirectory(resolved.path)
}

export function projectName(cwd: ProjectCwd) {
  return path.basename(cwd) || cwd
}

export function projectInitial(cwd: ProjectCwd) {
  const name = projectName(cwd)
  return name ? name[0]!.toUpperCase() : "?"
}

export function mergeListedAgents(lists: ReadonlyArray<ReadonlyArray<SDKAgentInfo>>) {
  const merged = new Map<string, SDKAgentInfo>()
  for (const items of lists) {
    for (const item of items) {
      const existing = merged.get(item.agentId)
      if (!existing || (item.lastModified ?? 0) >= (existing.lastModified ?? 0)) {
        merged.set(item.agentId, item)
      }
    }
  }
  return [...merged.values()].sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
}
