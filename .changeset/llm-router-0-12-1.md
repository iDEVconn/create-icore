---
'@idevconn/create-icore': patch
---

Bump `@idevconn/llm-router` to `^0.12.1` (patch, published minutes after `0.12.0`) — fixes a real bug in `GeminiStrategy.generate()`: `maxTokens` was silently ignored, never wired into Gemini's `generationConfig.maxOutputTokens`. Gemini is this repo's default `AI_PROVIDER`, so `ai.generate`/`ai.orchestrate` calls against it were not honoring the caller's token cap before this fix. No type/API surface change — runtime-only diff (`dist/gemini.js`).
