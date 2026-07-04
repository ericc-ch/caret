import { extend } from "@opentui/solid/components"

import { ImageRenderable } from "./image/image-renderable.ts"

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    image: typeof ImageRenderable
  }
}

export function registerImage(): void {
  extend({ image: ImageRenderable })
}
