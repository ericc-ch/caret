import { RGBA, type OptimizedBuffer } from "@opentui/core"

const UPPER_HALF_BLOCK = "\u2580"

interface ResizeInput {
  source: Uint8Array
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
  sourceX?: number
  sourceY?: number
  cropWidth?: number
  cropHeight?: number
}

function resizeRgba(input: ResizeInput): Uint8Array {
  const sourceX = input.sourceX ?? 0
  const sourceY = input.sourceY ?? 0
  const cropWidth = input.cropWidth ?? input.sourceWidth
  const cropHeight = input.cropHeight ?? input.sourceHeight
  const { source, sourceWidth, targetWidth, targetHeight } = input
  if (targetWidth <= 0 || targetHeight <= 0) return new Uint8Array(0)

  const output = new Uint8Array(targetWidth * targetHeight * 4)
  for (let y = 0; y < targetHeight; y++) {
    const sy = sourceY + Math.min(cropHeight - 1, Math.floor((y * cropHeight) / targetHeight))
    for (let x = 0; x < targetWidth; x++) {
      const sx = sourceX + Math.min(cropWidth - 1, Math.floor((x * cropWidth) / targetWidth))
      const sourceIndex = (sy * sourceWidth + sx) * 4
      const targetIndex = (y * targetWidth + x) * 4
      output[targetIndex] = source[sourceIndex]!
      output[targetIndex + 1] = source[sourceIndex + 1]!
      output[targetIndex + 2] = source[sourceIndex + 2]!
      output[targetIndex + 3] = source[sourceIndex + 3]!
    }
  }
  return output
}

function pixelColor(input: { data: Uint8Array; width: number; x: number; y: number }): RGBA {
  const { data, width, x, y } = input
  if (x < 0 || y < 0 || x >= width) return RGBA.fromValues(0, 0, 0, 0)
  const maxY = Math.floor(data.length / (width * 4)) - 1
  if (y > maxY) return RGBA.fromValues(0, 0, 0, 0)
  const index = (y * width + x) * 4
  return RGBA.fromInts(data[index]!, data[index + 1]!, data[index + 2]!, data[index + 3]!)
}

export interface DrawHalfBlockImageInput {
  buffer: OptimizedBuffer
  x: number
  y: number
  cellWidth: number
  cellHeight: number
  source: Uint8Array
  sourceWidth: number
  sourceHeight: number
  sourceX?: number
  sourceY?: number
  cropWidth?: number
  cropHeight?: number
}

export function drawHalfBlockImage(input: DrawHalfBlockImageInput): void {
  const {
    buffer,
    x,
    y,
    cellWidth,
    cellHeight,
    source,
    sourceWidth,
    sourceHeight,
    sourceX = 0,
    sourceY = 0,
    cropWidth = sourceWidth,
    cropHeight = sourceHeight,
  } = input

  if (cellWidth <= 0 || cellHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return

  const pixelWidth = cellWidth
  const pixelHeight = cellHeight * 2
  const scaled = resizeRgba({
    source,
    sourceWidth,
    sourceHeight,
    targetWidth: pixelWidth,
    targetHeight: pixelHeight,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
  })

  for (let row = 0; row < cellHeight; row++) {
    for (let col = 0; col < cellWidth; col++) {
      const top = pixelColor({ data: scaled, width: pixelWidth, x: col, y: row * 2 })
      const bottom = pixelColor({ data: scaled, width: pixelWidth, x: col, y: row * 2 + 1 })
      if (top.a === 0 && bottom.a === 0) continue
      buffer.setCellWithAlphaBlending(x + col, y + row, UPPER_HALF_BLOCK, top, bottom)
    }
  }
}
