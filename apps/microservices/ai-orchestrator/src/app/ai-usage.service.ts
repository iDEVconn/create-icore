import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DBStrategy, WhereClause } from '@icore/shared';
import type {
  AiUsageBreakdownRow,
  AiUsageByUserRow,
  AiUsageRange,
  AiUsageRecord,
  AiUsageSummary,
  AiUsageTimeseries,
} from '@idevconn/ai-usage';

const COLLECTION = 'ai_usage_records';

const RANGE_TO_MS: Record<AiUsageRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

function groupBy(
  records: AiUsageRecord[],
  key: 'provider' | 'operation' | 'key_source',
): AiUsageBreakdownRow[] {
  const byKey = new Map<string, AiUsageBreakdownRow>();
  for (const record of records) {
    const k = record[key];
    const existing = byKey.get(k) ?? {
      key: k,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: undefined,
    };
    existing.calls += 1;
    existing.input_tokens += record.input_tokens;
    existing.output_tokens += record.output_tokens;
    if (record.cost_usd != null) {
      existing.total_cost_usd = (existing.total_cost_usd ?? 0) + record.cost_usd;
    }
    byKey.set(k, existing);
  }
  return [...byKey.values()];
}

function groupByUser(records: AiUsageRecord[]): AiUsageByUserRow[] {
  const byUser = new Map<string, AiUsageByUserRow>();
  for (const record of records) {
    // Email/full_name enrichment needs an auth-MS lookup the gateway data
    // source doesn't have yet (AuthClientService has no get-user-by-id RPC)
    // — `null` is the package's documented "host has no data" signal, not a
    // bug. Follow-up: add `auth.getUser` and enrich in
    // GatewayAiUsageDataSource.
    const existing = byUser.get(record.user_id) ?? {
      user_id: record.user_id,
      email: null,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: undefined,
    };
    existing.calls += 1;
    existing.input_tokens += record.input_tokens;
    existing.output_tokens += record.output_tokens;
    if (record.cost_usd != null) {
      existing.total_cost_usd = (existing.total_cost_usd ?? 0) + record.cost_usd;
    }
    byUser.set(record.user_id, existing);
  }
  return [...byUser.values()];
}

/**
 * Records `AiUsageRecord`s emitted by `app.module.ts`'s `onCall` hook and
 * aggregates them into `AiUsageSummary`/`AiUsageTimeseries` for
 * `AiController`'s `ai.usage.*` message patterns.
 *
 * Storage goes through the same `DBStrategy` contract every other feature in
 * this repo uses (`ai-usage-db.provider.ts`, generated the same way as
 * notes' `db.provider.ts`) — NOT a Supabase-specific client. That file is
 * wired independently of the notes demo's db axis (the `ai` feature can be
 * chosen with `example=none`) and always provides a `DBStrategy`: the real
 * one for whatever `DB_PROVIDER` the project picked, or a `FakeDBStrategy`
 * (in-memory, lost on restart) when `DB_PROVIDER=none`. This class never
 * needs to know which one it got.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(@Inject('DBStrategy') private readonly db: DBStrategy) {}

  /**
   * Best-effort: a failed write is logged, never thrown — a usage-tracking
   * outage must not fail the `ai.generate`/`ai.orchestrate` call it's
   * recording.
   */
  async record(record: AiUsageRecord): Promise<void> {
    try {
      await this.db.set(COLLECTION, randomUUID(), record);
    } catch (err) {
      this.logger.warn(
        `Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getSummary(range: AiUsageRange, userId?: string): Promise<AiUsageSummary> {
    const records = await this.fetchRecords(range, userId);
    const totalCost = records.reduce((sum, r) => (r.cost_usd != null ? sum + r.cost_usd : sum), 0);
    return {
      total_calls: records.length,
      total_input_tokens: records.reduce((sum, r) => sum + r.input_tokens, 0),
      total_output_tokens: records.reduce((sum, r) => sum + r.output_tokens, 0),
      success_count: records.filter((r) => r.success).length,
      error_count: records.filter((r) => !r.success).length,
      by_provider: groupBy(records, 'provider'),
      by_operation: groupBy(records, 'operation'),
      by_key_source: groupBy(records, 'key_source'),
      by_user: groupByUser(records),
      total_cost_usd: records.some((r) => r.cost_usd != null) ? totalCost : undefined,
    };
  }

  async getTimeseries(range: AiUsageRange, userId?: string): Promise<AiUsageTimeseries> {
    const records = await this.fetchRecords(range, userId);
    const byDay = new Map<
      string,
      { calls: number; input_tokens: number; output_tokens: number; cost_usd: number | undefined }
    >();
    for (const record of records) {
      const date = record.timestamp.slice(0, 10);
      const existing = byDay.get(date) ?? {
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: undefined,
      };
      existing.calls += 1;
      existing.input_tokens += record.input_tokens;
      existing.output_tokens += record.output_tokens;
      if (record.cost_usd != null) existing.cost_usd = (existing.cost_usd ?? 0) + record.cost_usd;
      byDay.set(date, existing);
    }
    return {
      points: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, point]) => ({ date, ...point })),
    };
  }

  private async fetchRecords(range: AiUsageRange, userId?: string): Promise<AiUsageRecord[]> {
    const since = new Date(Date.now() - RANGE_TO_MS[range]).toISOString();
    const where: WhereClause[] = [{ field: 'timestamp', op: '>=', value: since }];
    if (userId) where.push({ field: 'user_id', op: '==', value: userId });
    const docs = await this.db.list<AiUsageRecord>(COLLECTION, { where });
    return docs.map((d) => d.data);
  }
}
