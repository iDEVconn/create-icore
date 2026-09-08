import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { AiUsageRecord } from '@idevconn/ai-usage';

let rows: Array<Record<string, unknown>> = [];
const insertMock = vi.fn().mockResolvedValue({ error: null });
const fromMock = vi.fn().mockImplementation(() => ({
  insert: insertMock,
  select: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
    resolve({ data: rows, error: null }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockImplementation(() => ({ from: fromMock })),
}));

import { AiUsageService } from '../ai-usage.service';

function configService(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const CONFIGURED_ENV = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

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
  beforeEach(() => {
    rows = [];
    insertMock.mockClear();
    fromMock.mockClear();
  });

  it('is not configured when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing', async () => {
    const service = new AiUsageService(configService({}));
    await service.onModuleInit();
    expect(service.isConfigured()).toBe(false);
    await expect(service.getSummary('7d')).rejects.toThrow(/not configured/);
  });

  it('record() is a no-op (never throws) when not configured', async () => {
    const service = new AiUsageService(configService({}));
    await service.onModuleInit();
    await expect(service.record(record())).resolves.toBeUndefined();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('record() inserts a row when configured', async () => {
    const service = new AiUsageService(configService(CONFIGURED_ENV));
    await service.onModuleInit();

    await service.record(record({ cost_usd: 0.002 }));

    expect(fromMock).toHaveBeenCalledWith('ai_usage_records');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini',
        operation: 'generate',
        input_tokens: 10,
        output_tokens: 20,
        success: true,
        user_id: 'user-1',
        key_source: 'platform',
        cost_usd: 0.002,
      }),
    );
  });

  it('getSummary() aggregates rows by provider/operation/key_source/user', async () => {
    rows = [
      {
        provider: 'gemini',
        operation: 'generate',
        input_tokens: 10,
        output_tokens: 20,
        success: true,
        user_id: 'user-1',
        key_source: 'platform',
        cost_usd: 0.01,
        created_at: '2026-09-08T00:00:00.000Z',
      },
      {
        provider: 'claude',
        operation: 'orchestrate',
        input_tokens: 5,
        output_tokens: 15,
        success: false,
        user_id: 'user-2',
        key_source: 'byok',
        cost_usd: null,
        created_at: '2026-09-08T01:00:00.000Z',
      },
    ];
    const service = new AiUsageService(configService(CONFIGURED_ENV));
    await service.onModuleInit();

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

  it('getTimeseries() buckets rows by day', async () => {
    rows = [
      {
        provider: 'gemini',
        operation: 'generate',
        input_tokens: 10,
        output_tokens: 20,
        success: true,
        user_id: 'user-1',
        key_source: 'platform',
        cost_usd: null,
        created_at: '2026-09-08T00:00:00.000Z',
      },
      {
        provider: 'gemini',
        operation: 'generate',
        input_tokens: 1,
        output_tokens: 2,
        success: true,
        user_id: 'user-1',
        key_source: 'platform',
        cost_usd: null,
        created_at: '2026-09-08T12:00:00.000Z',
      },
    ];
    const service = new AiUsageService(configService(CONFIGURED_ENV));
    await service.onModuleInit();

    const timeseries = await service.getTimeseries('7d');

    expect(timeseries.points).toHaveLength(1);
    expect(timeseries.points[0]).toMatchObject({ date: '2026-09-08', calls: 2 });
  });
});
