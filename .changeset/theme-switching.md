---
'@idevconn/create-icore': minor
---

Unified light/dark theme switching across all three UI templates (shadcn, antd, mui). A single Zustand store in `@icore/template-shared` (`useTheme()` / `useThemeStore`) drives each template's library-specific theming primitives — Tailwind `html.dark` class for shadcn, `ConfigProvider.theme.algorithm` for antd, `createTheme({ palette: { mode } })` for MUI. First load detects `prefers-color-scheme: dark`; subsequent loads restore from localStorage (`icore-theme`). Every template's LayoutHeader ships a `<ThemeToggle />` button.
