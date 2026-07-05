import process from "node:process"

export const NAV_WIDTH = 28
export const CONTEXT_WIDTH = 24
export const WIDE_BREAKPOINT = 120

export function truncatePath(path: string, maxLength = 32) {
  if (path.length <= maxLength) return path
  const home = process.env["HOME"]
  if (home && path.startsWith(home)) {
    const shortened = `~${path.slice(home.length)}`
    if (shortened.length <= maxLength) return shortened
    return `…${shortened.slice(-(maxLength - 1))}`
  }
  return `…${path.slice(-(maxLength - 1))}`
}

export function displayCwd() {
  return truncatePath(process.cwd())
}
