import {
  Renderable,
  type OptimizedBuffer,
  type RenderableOptions,
  type RenderContext,
} from "@opentui/core"

import { drawHalfBlockImage } from "./half-blocks.ts"
import { loadDecodedImage } from "./load-image.ts"
import type { DecodedImage, ImageFit, ImageRenderProtocol, ImageSource } from "./types.ts"

export interface ImageRenderableOptions extends RenderableOptions<ImageRenderable> {
  source?: ImageSource
  fit?: ImageFit
  protocol?: ImageRenderProtocol
  onLoad?: (image: DecodedImage) => void
  onError?: (error: unknown) => void
}

export function resolveImageRenderProtocol(
  _requested: ImageRenderProtocol,
  _capabilities: unknown,
  _hasResolution: boolean,
): Exclude<ImageRenderProtocol, "auto"> {
  return "blocks"
}

export class ImageRenderable extends Renderable {
  private _source: ImageSource | undefined
  private _image: DecodedImage | null = null
  private _loading = false
  private _loadError: unknown = null
  private _loadGeneration = 0
  private _loadController: AbortController | null = null
  private readonly _onLoad: ((image: DecodedImage) => void) | undefined
  private readonly _onError: ((error: unknown) => void) | undefined
  private _fit: ImageFit
  private _protocol: ImageRenderProtocol
  public loadPromise: Promise<void> | null = null

  constructor(ctx: RenderContext, options: ImageRenderableOptions) {
    super(ctx, options)
    this._fit = options.fit ?? "fit"
    this._protocol = options.protocol ?? "auto"
    this._onLoad = options.onLoad
    this._onError = options.onError
    if (options.source !== undefined) this.source = options.source
  }

  public get source(): ImageSource | undefined {
    return this._source
  }

  public set source(source: ImageSource | undefined) {
    this._source = source
    const generation = ++this._loadGeneration
    this._loadController?.abort()
    this._loadController = null

    if (source === undefined) {
      this._loading = false
      this._loadError = null
      this._image?.dispose()
      this._image = null
      this.loadPromise = null
      this.requestRender()
      return
    }

    const controller = new AbortController()
    this._loadController = controller
    this._loading = true
    this._loadError = null
    this.loadPromise = this.load(source, generation, controller)
  }

  public get image(): DecodedImage | null {
    return this._image
  }

  public get fit(): ImageFit {
    return this._fit
  }

  public set fit(value: ImageFit) {
    if (this._fit === value) return
    this._fit = value
    this.requestRender()
  }

  public get protocol(): ImageRenderProtocol {
    return this._protocol
  }

  public set protocol(value: ImageRenderProtocol) {
    if (this._protocol === value) return
    this._protocol = value
    this.requestRender()
  }

  public get effectiveProtocol(): Exclude<ImageRenderProtocol, "auto"> {
    return resolveImageRenderProtocol(this._protocol, null, false)
  }

  public get cellAspectRatio(): number {
    void this._fit
    return 2
  }

  // Matches OpenTUI ImageRenderable.getFittedSize for future migration.
  // oxlint-disable-next-line max-params
  public getFittedSize(
    targetWidth: number,
    targetHeight: number,
    cellAspectRatio?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ): { width: number; height: number } {
    return this.computeFittedSize({
      targetWidth,
      targetHeight,
      cellAspectRatio: cellAspectRatio ?? this.cellAspectRatio,
      sourceWidth: sourceWidth ?? this._image?.width ?? 0,
      sourceHeight: sourceHeight ?? this._image?.height ?? 0,
    })
  }

  private computeFittedSize(input: {
    targetWidth: number
    targetHeight: number
    cellAspectRatio: number
    sourceWidth: number
    sourceHeight: number
  }): { width: number; height: number } {
    const { targetWidth, targetHeight, cellAspectRatio, sourceWidth, sourceHeight } = input
    if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0)
      return { width: 0, height: 0 }
    if (this._fit === "fill") return { width: targetWidth, height: targetHeight }

    const displayAspect = (sourceWidth / sourceHeight) * cellAspectRatio
    const scale =
      this._fit === "fit"
        ? Math.min(targetWidth / displayAspect, targetHeight)
        : Math.max(targetWidth / displayAspect, targetHeight)
    return {
      width: Math.max(1, Math.round(displayAspect * scale)),
      height: Math.max(1, Math.round(scale)),
    }
  }

  public get loading(): boolean {
    return this._loading
  }

  public get loadError(): unknown {
    return this._loadError
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    if (!this._image || this.width <= 0 || this.height <= 0) return

    const fitted =
      this._fit === "cover"
        ? { width: this.width, height: this.height }
        : this.getFittedSize(this.width, this.height)
    if (fitted.width <= 0 || fitted.height <= 0) return

    const originX = this.buffered ? 0 : this._screenX
    const originY = this.buffered ? 0 : this._screenY
    const x = originX + Math.floor((this.width - fitted.width) / 2)
    const y = originY + Math.floor((this.height - fitted.height) / 2)

    let sourceX = 0
    let sourceY = 0
    let sourceWidth = this._image.width
    let sourceHeight = this._image.height

    if (this._fit === "cover") {
      const targetAspect = this.width / (this.height * this.cellAspectRatio)
      const sourceAspect = sourceWidth / sourceHeight
      if (sourceAspect > targetAspect) {
        sourceWidth = Math.max(1, Math.round(sourceHeight * targetAspect))
        sourceX = Math.floor((this._image.width - sourceWidth) / 2)
      } else {
        sourceHeight = Math.max(1, Math.round(sourceWidth / targetAspect))
        sourceY = Math.floor((this._image.height - sourceHeight) / 2)
      }
    }

    drawHalfBlockImage({
      buffer,
      x,
      y,
      cellWidth: fitted.width,
      cellHeight: fitted.height,
      source: this._image.raw(),
      sourceWidth: this._image.width,
      sourceHeight: this._image.height,
      sourceX,
      sourceY,
      cropWidth: sourceWidth,
      cropHeight: sourceHeight,
    })
  }

  private async load(
    source: ImageSource,
    generation: number,
    controller: AbortController,
  ): Promise<void> {
    let image: DecodedImage
    try {
      image = await loadDecodedImage(source, { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted || this.isDestroyed || generation !== this._loadGeneration)
        return
      this._loading = false
      this._loadController = null
      this._loadError = error
      this._onError?.(error)
      return
    }

    if (this.isDestroyed || generation !== this._loadGeneration) {
      image.dispose()
      return
    }

    const previous = this._image
    this._image = image
    this._loading = false
    this._loadController = null
    previous?.dispose()
    this.requestRender()
    this._onLoad?.(image)
  }

  protected override destroySelf(): void {
    ++this._loadGeneration
    this._loadController?.abort()
    this._loadController = null
    this._loading = false
    this._image?.dispose()
    this._image = null
    super.destroySelf()
  }
}
