import { describe, expect, it } from 'vitest';
import { AiController } from '../ai.controller';

// Lives next to the AI feature on purpose: the generator deletes apps/api/src/app/ai with the
// feature, and this test must disappear with it (a test in http/ importing it breaks ai=none).
describe('AiController rate limits', () => {
  it('keeps every LLM-backed route inside the ai-burst limiter', () => {
    // If one of these decorators disappeared, skipUnlessDeclared would stop limiting that route
    // by ai-burst (only the generous default floor would remain).
    const limit = (handler: object) => Reflect.getMetadata('THROTTLER:LIMITai-burst', handler);
    expect(limit(AiController.prototype.generate)).toBe(10);
    expect(limit(AiController.prototype.orchestrate)).toBe(10);
    expect(limit(AiController.prototype.ragQuery)).toBe(10);
  });
});
