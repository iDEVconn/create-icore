---
'@idevconn/create-icore': patch
---

Bump `@idevconn/llm-router` to `^0.12.0` (from `^0.10.0`) — additive-only release (multi-turn `messages` support alongside `prompt`, new `withRetry`/`withCircuitBreaker`/`withRateLimit` strategy wrappers, corrected dual ESM/CJS `exports` typing). No breaking changes to the `LlmRegistry`/`Orchestrator`/`TaskRouter`/provider-strategy surface this repo uses. Fixed one real fallout: `FakeLlmStrategy.generate()` assumed `opts.prompt` was always a string — it's optional now that `messages` is a valid alternative — so it falls back to the last message's content.
