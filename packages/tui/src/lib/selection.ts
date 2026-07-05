import type { CliRenderer } from "@opentui/core"

export function copySelectedText(renderer: CliRenderer): boolean {
  const selection = renderer.getSelection()
  if (!selection) return false

  const text = selection.getSelectedText()
  if (!text) return false

  renderer.copyToClipboardOSC52(text)
  renderer.clearSelection()
  return true
}
