import { describe, expect, it, beforeEach } from 'vitest';
import { FakeDBStrategy } from '@icore/shared';
import type { AiUsageRecord } from '@idevconn/ai-usage';
import { AiUsageService } from '../ai-usage.service';

function record(overrides: Partial<AiUsageRecord> = {}): AiUsageRecord {
  return {
    timestamp: '2026-09-08T00:00:00.000Z',
    provider: 'gemini',
    operation: 'generate',
    input_tokens: 10,
    output_tokens: 20,
    success: true,
    user_id: 'user-1',
    key_source: 'platform',
    ...overrides,
  };
}

describe('AiUsageService', () => {
  let db: FakeDBStrategy;
  let service: AiUsageService;

  beforeEach(() => {
    db = new FakeDBStrategy();
    service = new AiUsageService(db);
  });

  it('record() writes through the injected DBStrategy — agnostic of which one it is', async () => {
    await service.record(record());
    const rows = await db.list('ai_usage_records');
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ provider: 'gemini', user_id: 'user-1' });
  });

  it('record() never throws even if the DBStrategy write fails', async () => {
    const failing = { set: () => Promise.reject(new Error('boom')) } as unknown as FakeDBStrategy;
    const failingService = new AiUsageService(failing);
    await expect(failingService.record(record())).resolves.toBeUndefined();
  });

  it('getSummary() aggregates records by provider/operation/key_source/user', async () => {
    await service.record(
      record({ provider: 'gemini', operation: 'generate', cost_usd: 0.01, user_id: 'user-1' }),
    );
    await service.record(
      record({
        provider: 'claude',
        operation: 'orchestrate',
        success: false,
        key_source: 'byok',
        user_id: 'user-2',
        input_tokens: 5,
        output_tokens: 15,
        cost_usd: undefined,
      }),
    );

    const summary = await service.getSummary('7d');

    expect(summary.total_calls).toBe(2);
    expect(summary.total_input_tokens).toBe(15);
    expect(summary.total_output_tokens).toBe(35);
    expect(summary.success_count).toBe(1);
    expect(summary.error_count).toBe(1);
    expect(summary.by_provider).toHaveLength(2);
    expect(summary.by_user.find((u) => u.user_id === 'user-1')?.calls).toBe(1);
    expect(summary.total_cost_usd).toBe(0.01);
  });

  it('getSummary() filters by userId', async () => {
    await service.record(record({ user_id: 'user-1' }));
    await service.record(record({ user_id: 'user-2' }));

    const summary = await service.getSummary('7d', 'user-1');

    expect(summary.total_calls).toBe(1);
    expect(summary.by_user).toEqual([expect.objectContaining({ user_id: 'user-1' })]);
  });

  it('getSummary() excludes records outside the requested range', async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await service.record(record({ timestamp: old }));
    await service.record(record({ timestamp: new Date().toISOString() }));

    const summary = await service.getSummary('30d');

    expect(summary.total_calls).toBe(1);
  });

  it('getTimeseries() buckets records by day', async () => {
    await service.record(record({ timestamp: '2026-09-08T00:00:00.000Z' }));
    await service.record(record({ timestamp: '2026-09-08T12:00:00.000Z' }));

    const timeseries = await service.getTimeseries('7d');

    expect(timeseries.points).toHaveLength(1);
    expect(timeseries.points[0]).toMatchObject({ date: '2026-09-08', calls: 2 });
  });
});
