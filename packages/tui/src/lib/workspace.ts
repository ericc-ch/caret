import { execFile } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import type { SDKAgentInfo } from "@cursor/sdk"

const execFileAsync = promisify(execFile)

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export async function resolveGitRoot(cwd = process.cwd()) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd })
    const root = stdout.trim()
    return root || undefined
  } catch {
    return undefined
  }
}

export async function resolveSdkListCwds(cwd = process.cwd()) {
  const roots = new Set([path.resolve(cwd), packageRoot])
  const gitRoot = await resolveGitRoot(cwd)
  if (gitRoot) roots.add(path.resolve(gitRoot))
  return [...roots]
}

export async function resolveDefaultSdkCwd(cwd = process.cwd()) {
  return (await resolveGitRoot(cwd)) ?? path.resolve(cwd)
}

export function localAgentCwd(info: SDKAgentInfo) {
  return "cwd" in info ? info.cwd : undefined
}
