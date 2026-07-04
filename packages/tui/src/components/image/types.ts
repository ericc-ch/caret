export type ImageFit = "fit" | "cover" | "fill"

/** Accepted for OpenTUI migration; this implementation always renders with half blocks. */
export type ImageRenderProtocol = "auto" | "kitty" | "sixel" | "blocks"

export type ImageSource = string | URL | Uint8Array | ArrayBuffer

export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "unknown"

export type ImageLoadErrorCode =
  | "file-read"
  | "network"
  | "http-status"
  | "unsupported-url-scheme"
  | "decode"

export class ImageLoadError extends Error {
  public readonly code: ImageLoadErrorCode
  public readonly source: string
  public readonly status?: number

  constructor(input: {
    code: ImageLoadErrorCode
    source: string
    message: string
    cause?: unknown
    status?: number
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = "ImageLoadError"
    this.code = input.code
    this.source = input.source
    if (input.status !== undefined) this.status = input.status
  }
}

export interface ImageInfo {
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  format: ImageFormat
  hasAlpha: boolean
}

/** Drop-in stand-in for OpenTUI `NativeImage` until native-image-lib ships. */
export class DecodedImage {
  private _data: Uint8Array
  readonly width: number
  readonly height: number
  readonly format: ImageFormat
  readonly hasAlpha: boolean

  constructor(input: {
    data: Uint8Array
    width: number
    height: number
    format: ImageFormat
    hasAlpha: boolean
  }) {
    this._data = input.data
    this.width = input.width
    this.height = input.height
    this.format = input.format
    this.hasAlpha = input.hasAlpha
  }

  info(): ImageInfo {
    return {
      width: this.width,
      height: this.height,
      sourceWidth: this.width,
      sourceHeight: this.height,
      format: this.format,
      hasAlpha: this.hasAlpha,
    }
  }

  raw(): Uint8Array {
    return this._data
  }

  dispose(): void {
    this._data = new Uint8Array(0)
  }
}

export interface ImageLoadOptions {
  signal?: AbortSignal
  fetch?: (input: URL, init?: RequestInit) => Promise<Response>
}
