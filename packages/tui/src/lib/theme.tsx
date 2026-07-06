import { RGBA, SyntaxStyle, type TerminalColors } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import {
  createContext,
  createSignal,
  onMount,
  useContext,
  type ParentProps,
  type JSX,
} from "solid-js"

export type Theme = {
  readonly text: RGBA
  readonly textMuted: RGBA
  readonly background: RGBA
  readonly backgroundElement: RGBA
  readonly border: RGBA
  readonly accent: RGBA
  readonly error: RGBA
  readonly warning: RGBA
  readonly thinkingOpacity: number
  readonly markdownText: RGBA
  readonly markdownHeading: RGBA
  readonly markdownStrong: RGBA
  readonly markdownEmph: RGBA
  readonly markdownListItem: RGBA
  readonly markdownBlockQuote: RGBA
  readonly markdownCode: RGBA
  readonly markdownLink: RGBA
  readonly markdownLinkText: RGBA
}

type ThemeContextValue = {
  theme: () => Theme
  syntax: () => SyntaxStyle
}

const ThemeContext = createContext<ThemeContextValue>()

function hex(value: string): RGBA {
  return RGBA.fromHex(value)
}

function createFallbackTheme(): Theme {
  const text = hex("#e4e4e4")
  const textMuted = hex("#8b8b8b")
  const background = hex("#181818")
  const backgroundElement = hex("#2e2e2e")
  const border = RGBA.fromInts(228, 228, 228, 38)
  const accent = hex("#81a1c1")
  const error = hex("#e34671")
  const warning = hex("#e5c07b")

  return {
    text,
    textMuted,
    background,
    backgroundElement,
    border,
    accent,
    error,
    warning,
    thinkingOpacity: 0.6,
    markdownText: text,
    markdownHeading: text,
    markdownStrong: text,
    markdownEmph: warning,
    markdownListItem: accent,
    markdownBlockQuote: warning,
    markdownCode: hex("#98c379"),
    markdownLink: hex("#61afef"),
    markdownLinkText: accent,
  }
}

const FALLBACK_THEME = createFallbackTheme()

function ansiToRgba(code: number): RGBA {
  if (code < 16) {
    const ansiColors = [
      "#000000",
      "#800000",
      "#008000",
      "#808000",
      "#000080",
      "#800080",
      "#008080",
      "#c0c0c0",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
    ]
    return RGBA.fromHex(ansiColors[code] ?? "#000000")
  }

  if (code < 232) {
    const index = code - 16
    const b = index % 6
    const g = Math.floor(index / 6) % 6
    const r = Math.floor(index / 36)
    const val = (x: number) => (x === 0 ? 0 : x * 40 + 55)
    return RGBA.fromInts(val(r), val(g), val(b))
  }

  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    return RGBA.fromInts(gray, gray, gray)
  }

  return RGBA.fromInts(0, 0, 0)
}

function generateGrayScale(bg: RGBA, isDark: boolean): Record<number, RGBA> {
  const grays: Record<number, RGBA> = {}
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const luminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB

  for (let i = 1; i <= 12; i++) {
    const factor = i / 12.0
    let newR: number
    let newG: number
    let newB: number

    if (isDark) {
      if (luminance < 10) {
        const grayValue = Math.floor(factor * 0.4 * 255)
        newR = grayValue
        newG = grayValue
        newB = grayValue
      } else {
        const newLum = luminance + (255 - luminance) * factor * 0.4
        const ratio = newLum / luminance
        newR = Math.min(bgR * ratio, 255)
        newG = Math.min(bgG * ratio, 255)
        newB = Math.min(bgB * ratio, 255)
      }
    } else if (luminance > 245) {
      const grayValue = Math.floor(255 - factor * 0.4 * 255)
      newR = grayValue
      newG = grayValue
      newB = grayValue
    } else {
      const newLum = luminance * (1 - factor * 0.4)
      const ratio = newLum / luminance
      newR = Math.max(bgR * ratio, 0)
      newG = Math.max(bgG * ratio, 0)
      newB = Math.max(bgB * ratio, 0)
    }

    grays[i] = RGBA.fromInts(Math.floor(newR), Math.floor(newG), Math.floor(newB))
  }

  return grays
}

function generateMutedTextColor(bg: RGBA, isDark: boolean): RGBA {
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB

  let grayValue: number
  if (isDark) {
    grayValue = bgLum < 10 ? 180 : Math.min(Math.floor(160 + bgLum * 0.3), 200)
  } else {
    grayValue = bgLum > 245 ? 75 : Math.max(Math.floor(100 - (255 - bgLum) * 0.2), 60)
  }

  return RGBA.fromInts(grayValue, grayValue, grayValue)
}

function terminalMode(colors: TerminalColors): "dark" | "light" | undefined {
  const bg = colors.defaultBackground
  if (!bg) return
  const { r, g, b } = RGBA.fromHex(bg)
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.5 ? "light" : "dark"
}

function generateSystemTheme(colors: TerminalColors, mode: "dark" | "light"): Theme {
  const bg = RGBA.fromHex(colors.defaultBackground ?? colors.palette[0]!)
  const fg = RGBA.fromHex(colors.defaultForeground ?? colors.palette[7]!)
  const isDark = mode === "dark"

  const col = (i: number) => {
    const value = colors.palette[i]
    if (value) return RGBA.fromHex(value)
    return ansiToRgba(i)
  }

  const grays = generateGrayScale(bg, isDark)
  const textMuted = generateMutedTextColor(bg, isDark)

  const ansiColors = {
    red: col(1),
    green: col(2),
    yellow: col(3),
    blue: col(4),
    magenta: col(5),
    cyan: col(6),
  }

  return {
    text: fg,
    textMuted,
    background: bg,
    backgroundElement: grays[3]!,
    border: grays[7]!,
    accent: ansiColors.cyan,
    error: ansiColors.red,
    warning: ansiColors.yellow,
    thinkingOpacity: 0.6,
    markdownText: fg,
    markdownHeading: fg,
    markdownStrong: fg,
    markdownEmph: ansiColors.yellow,
    markdownListItem: ansiColors.blue,
    markdownBlockQuote: ansiColors.yellow,
    markdownCode: ansiColors.green,
    markdownLink: ansiColors.blue,
    markdownLinkText: ansiColors.cyan,
  }
}

export function generateSyntax(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromTheme([
    {
      scope: ["default", "spell", "nospell"],
      style: { foreground: theme.text },
    },
    {
      scope: ["conceal"],
      style: { foreground: theme.textMuted },
    },
    {
      scope: [
        "markup.heading",
        "markup.heading.1",
        "markup.heading.2",
        "markup.heading.3",
        "markup.heading.4",
        "markup.heading.5",
        "markup.heading.6",
      ],
      style: { foreground: theme.markdownHeading, bold: true },
    },
    {
      scope: ["markup.heading.1"],
      style: { foreground: theme.markdownHeading, bold: true, underline: true },
    },
    {
      scope: ["markup.bold", "markup.strong"],
      style: { foreground: theme.markdownStrong, bold: true },
    },
    {
      scope: ["markup.italic"],
      style: { foreground: theme.markdownEmph, italic: true },
    },
    {
      scope: ["markup.list"],
      style: { foreground: theme.markdownListItem },
    },
    {
      scope: ["markup.quote"],
      style: { foreground: theme.markdownBlockQuote, italic: true },
    },
    {
      scope: ["markup.raw", "markup.raw.block"],
      style: { foreground: theme.markdownCode },
    },
    {
      scope: ["markup.raw.inline"],
      style: { foreground: theme.markdownCode, background: theme.background },
    },
    {
      scope: ["markup.link", "markup.link.url"],
      style: { foreground: theme.markdownLink, underline: true },
    },
    {
      scope: ["markup.link.label", "label"],
      style: { foreground: theme.markdownLinkText, underline: true },
    },
    {
      scope: ["error"],
      style: { foreground: theme.error, bold: true },
    },
  ])
}

async function loadTheme(renderer: {
  getPalette(options?: { size?: number }): Promise<TerminalColors>
}): Promise<Theme> {
  try {
    const colors = await renderer.getPalette({ size: 16 })
    if (!colors.palette[0]) return FALLBACK_THEME
    const mode = terminalMode(colors) ?? "dark"
    return generateSystemTheme(colors, mode)
  } catch {
    return FALLBACK_THEME
  }
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme must be used within ThemeProvider")
  return value
}

export function ThemeProvider(props: ParentProps): JSX.Element {
  const renderer = useRenderer()
  const [theme, setTheme] = createSignal<Theme>(FALLBACK_THEME)
  const [syntax, setSyntax] = createSignal(generateSyntax(FALLBACK_THEME))

  onMount(() => {
    void loadTheme(renderer).then((resolved) => {
      setTheme(resolved)
      setSyntax(generateSyntax(resolved))
      renderer.setBackgroundColor(resolved.background)
    })
  })

  return <ThemeContext.Provider value={{ theme, syntax }}>{props.children}</ThemeContext.Provider>
}
