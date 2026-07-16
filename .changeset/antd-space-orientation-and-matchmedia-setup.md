---
"@idevconn/create-icore": patch
---

Two small antd client-template cleanups flagged in PR7's review: renamed all 13 uses of the deprecated `Space` `direction` prop to `orientation` (antd 6.x, same values, no behavior change) across the auth components; promoted the `window.matchMedia` jsdom polyfill from being localized to `LoginForm.spec.tsx` into a shared `src/test-setup.ts` wired via vitest's `setupFiles`, so future antd-responsive-component tests in this template get it automatically instead of needing their own copy.
