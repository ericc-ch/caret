import { render } from "@opentui/solid"
import { RegistryProvider } from "@effect/atom-solid"
import { App } from "./app.tsx"
import { ThemeProvider } from "./lib/theme.tsx"

render(
  () => (
    <RegistryProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RegistryProvider>
  ),
  {
    screenMode: "split-footer",
    footerHeight: 3,
  },
)
