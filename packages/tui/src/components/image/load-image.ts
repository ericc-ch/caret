import { fileURLToPath } from "node:url"

import { Jimp } from "jimp"

import {
  DecodedImage,
  ImageLoadError,
  type ImageFormat,
  type ImageLoadOptions,
  type ImageSource,
} from "./types.ts"

function toImageFormat(mime: string): ImageFormat {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
      return "jpeg"
    case "image/webp":
      return "webp"
    case "image/gif":
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

interface JimpBitmap {
  bitmap: { data: Buffer; width: number; height: number }
  mime?: string
}

function fromJimp(image: JimpBitmap): DecodedImage {
  const { data, width, height } = image.bitmap
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new DecodedImage({
    data: rgba,
    width,
    height,
    format: toImageFormat(image.mime ?? ""),
    hasAlpha: imageHasAlpha(rgba),
  })
}

function encodedBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new TypeError("image data must be a Uint8Array or ArrayBuffer")
}

async function readJimp(input: string | Uint8Array | ArrayBuffer): Promise<DecodedImage> {
  const image =
    typeof input === "string"
      ? await Jimp.read(input)
      : await Jimp.fromBuffer(Buffer.from(encodedBytes(input)))
  return fromJimp(image)
}

export async function loadDecodedImage(
  source: ImageSource,
  options: ImageLoadOptions = {},
): Promise<DecodedImage> {
  options.signal?.throwIfAborted()

  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    return readJimp(source)
  }

  if (source instanceof URL) {
    if (source.protocol === "file:") {
      try {
        return await readJimp(fileURLToPath(source))
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
      return readJimp(new Uint8Array(await response.arrayBuffer()))
    }

    throw new ImageLoadError({
      code: "unsupported-url-scheme",
      source: source.href,
      message: `Unsupported image URL scheme: ${source.protocol}`,
    })
  }

  if (/^https?:\/\//i.test(source) || /^data:/i.test(source)) {
    try {
      return await readJimp(source)
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
    return await readJimp(source)
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
