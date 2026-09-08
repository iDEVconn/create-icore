import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * `LlmCallEvent` (llm-router's `onCall`/`onCost` payload) carries only
 * provider/model/usage/latency — strategies are wrapped once at registry
 * construction, shared across every request, so the wrapper itself has no
 * way to know which gateway call or user triggered a given event.
 * `AiController` opens one of these contexts per `@MessagePattern` handler;
 * `app.module.ts`'s `onCall`/`onCost` callbacks read it back via
 * `aiUsageContext.getStore()` to tag each recorded row.
 */
export interface AiUsageCallContext {
  operation: string;
  userId: string;
  keySource: 'platform' | 'byok';
}

export const aiUsageContext = new AsyncLocalStorage<AiUsageCallContext>();
