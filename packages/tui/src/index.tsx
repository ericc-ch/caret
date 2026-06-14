import { render } from "@opentui/solid"
import { App } from "./app.tsx"
import { AppRegistryProvider } from "./reactivity/registry.tsx"
import { ThemeProvider } from "./lib/theme.tsx"

render(
  () => (
    <ThemeProvider>
      <AppRegistryProvider>
        <App />
      </AppRegistryProvider>
    </ThemeProvider>
  ),
  {
    screenMode: "split-footer",
    footerHeight: 3,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
    openConsoleOnError: false,
    autoFocus: false,
    exitOnCtrlC: true,
  },
)
