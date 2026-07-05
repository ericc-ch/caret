import { fileURLToPath } from "node:url"

import sharp from "sharp"

import {
  DecodedImage,
  ImageLoadError,
  type ImageFormat,
  type ImageLoadOptions,
  type ImageSource,
} from "./types.ts"

function toImageFormat(format: string): ImageFormat {
  switch (format) {
    case "png":
      return "png"
    case "jpeg":
    case "jpg":
      return "jpeg"
    case "webp":
      return "webp"
    case "gif":
      return "gif"
    default:
      return "unknown"
  }
}

function imageHasAlpha(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! !== 255) return true
  }
  return false
}

function encodedBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new TypeError("image data must be a Uint8Array or ArrayBuffer")
}

function decodeDataUrl(source: string): Uint8Array | null {
  const comma = source.indexOf(",")
  if (comma === -1 || !source.startsWith("data:")) return null
  const meta = source.slice(5, comma)
  if (!meta.includes(";base64")) return null
  return new Uint8Array(Buffer.from(source.slice(comma + 1), "base64"))
}

async function readSharp(input: string | Uint8Array | ArrayBuffer): Promise<DecodedImage> {
  const sharpInput =
    typeof input === "string"
      ? input
      : (() => {
          const bytes = encodedBytes(input)
          return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        })()

  const image = sharp(sharpInput)
  const metadata = await image.metadata()
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

  return new DecodedImage({
    data: rgba,
    width: info.width,
    height: info.height,
    format: toImageFormat(metadata.format ?? ""),
    hasAlpha: metadata.hasAlpha ?? imageHasAlpha(rgba),
  })
}

export async function loadDecodedImage(
  source: ImageSource,
  options: ImageLoadOptions = {},
): Promise<DecodedImage> {
  options.signal?.throwIfAborted()

  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    return readSharp(source)
  }

  if (source instanceof URL) {
    if (source.protocol === "file:") {
      try {
        return await readSharp(fileURLToPath(source))
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason
        throw new ImageLoadError({
          code: "file-read",
          source: source.href,
          message: `Failed to read image: ${source.href}`,
          cause: error,
        })
      }
    }

    if (source.protocol === "http:" || source.protocol === "https:") {
      const fetchImpl = options.fetch ?? fetch
      let response: Response
      try {
        response = await fetchImpl(source, options.signal ? { signal: options.signal } : {})
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason
        throw new ImageLoadError({
          code: "network",
          source: source.href,
          message: `Failed to fetch image: ${source.href}`,
          cause: error,
        })
      }

      if (!response.ok) {
        throw new ImageLoadError({
          code: "http-status",
          source: source.href,
          message: `HTTP ${response.status} for ${source.href}`,
          status: response.status,
        })
      }

      options.signal?.throwIfAborted()
      return readSharp(new Uint8Array(await response.arrayBuffer()))
    }

    throw new ImageLoadError({
      code: "unsupported-url-scheme",
      source: source.href,
      message: `Unsupported image URL scheme: ${source.protocol}`,
    })
  }

  if (/^data:/i.test(source)) {
    try {
      const bytes = decodeDataUrl(source)
      if (!bytes) {
        throw new Error("Invalid data URL")
      }
      return await readSharp(bytes)
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new ImageLoadError({
        code: "decode",
        source,
        message: `Failed to load image: ${source.slice(0, 48)}`,
        cause: error,
      })
    }
  }

  if (/^https?:\/\//i.test(source)) {
    const fetchImpl = options.fetch ?? fetch
    let response: Response
    try {
      response = await fetchImpl(new URL(source), options.signal ? { signal: options.signal } : {})
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new ImageLoadError({
        code: "network",
        source,
        message: `Failed to fetch image: ${source}`,
        cause: error,
      })
    }

    if (!response.ok) {
      throw new ImageLoadError({
        code: "http-status",
        source,
        message: `HTTP ${response.status} for ${source}`,
        status: response.status,
      })
    }

    options.signal?.throwIfAborted()
    try {
      return await readSharp(new Uint8Array(await response.arrayBuffer()))
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      throw new ImageLoadError({
        code: "decode",
        source,
        message: `Failed to load image: ${source.slice(0, 48)}`,
        cause: error,
      })
    }
  }

  try {
    return await readSharp(source)
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason
    const code =
      error instanceof Error && "code" in error && error.code === "ENOENT"
        ? "file-read"
        : ("decode" as const)
    throw new ImageLoadError({
      code,
      source,
      message: `Failed to load image: ${source}`,
      cause: error,
    })
  }
}
