import { ConsolePosition, createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { RegistryProvider } from "@effect/atom-solid"
import { App } from "./app/app.tsx"
import { registerImage } from "./components/register.ts"
import { ThemeProvider } from "./lib/theme.tsx"

registerImage()

const renderer = await createCliRenderer({
  screenMode: "alternate-screen",
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: true,
  useKittyKeyboard: {},
  autoFocus: false,
  consoleOptions: {
    position: ConsolePosition.RIGHT,
    sizePercent: 50,
    keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
  },
  useMouse: true,
})

await render(
  () => (
    <RegistryProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RegistryProvider>
  ),
  renderer,
)
