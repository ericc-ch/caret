export function formatError(cause: unknown): string {
  let detail = cause instanceof Error ? cause.message : String(cause)
  if (!detail || detail.trim() === "") {
    detail = "Something went wrong"
  }
  return detail
}
