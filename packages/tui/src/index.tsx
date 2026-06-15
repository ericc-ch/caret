import { render } from "@opentui/solid"
import { App } from "./app.tsx"
import { ThemeProvider } from "./lib/theme.tsx"

render(
  () => (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  ),
  {
    screenMode: "split-footer",
    footerHeight: 3,
  },
)
