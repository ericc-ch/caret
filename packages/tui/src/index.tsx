import { extend, render } from "@opentui/solid"
import { SpinnerRenderable } from "opentui-spinner"
import "opentui-spinner/solid" // JSX types; register on root catalogue below
import { App } from "./app.tsx"
import { AppRegistryProvider } from "./reactivity/registry.tsx"
import { ThemeProvider } from "./lib/theme.tsx"

extend({ spinner: SpinnerRenderable })

render(
  () => (
    <ThemeProvider>
      <AppRegistryProvider>
        <App />
      </AppRegistryProvider>
    </ThemeProvider>
  ),
  { exitOnCtrlC: true },
)
