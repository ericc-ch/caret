import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function readGitBranch(cwd = process.cwd()): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })
    const branch = stdout.trim()
    return branch === "HEAD" ? "detached" : branch
  } catch {
    return undefined
  }
}

export type GitFileChange = {
  readonly path: string
  readonly status: string
}

export async function isGitRepository(cwd = process.cwd()): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd })
    return stdout.trim() === "true"
  } catch {
    return false
  }
}

export async function readGitStatus(cwd = process.cwd()): Promise<ReadonlyArray<GitFileChange>> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd })
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        status: line.slice(0, 2).trim(),
        path: line.slice(3).trim(),
      }))
  } catch {
    return []
  }
}
