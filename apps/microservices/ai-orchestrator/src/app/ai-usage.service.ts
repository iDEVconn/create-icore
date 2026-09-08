import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { missingEnv, formatEnvBanner } from '@icore/shared';
import type {
  AiUsageBreakdownRow,
  AiUsageByUserRow,
  AiUsageRange,
  AiUsageRecord,
  AiUsageSummary,
  AiUsageTimeseries,
} from '@idevconn/ai-usage';

const DEFAULT_TABLE = 'ai_usage_records';

const RANGE_TO_MS: Record<AiUsageRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

interface UsageRow {
  provider: string;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  success: boolean;
  user_id: string;
  key_source: string;
  cost_usd: number | null;
  created_at: string;
}

function groupBy(
  rows: UsageRow[],
  key: 'provider' | 'operation' | 'key_source',
): AiUsageBreakdownRow[] {
  const byKey = new Map<string, AiUsageBreakdownRow>();
  for (const row of rows) {
    const k = row[key];
    const existing = byKey.get(k) ?? {
      key: k,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: undefined,
    };
    existing.calls += 1;
    existing.input_tokens += row.input_tokens;
    existing.output_tokens += row.output_tokens;
    if (row.cost_usd != null) {
      existing.total_cost_usd = (existing.total_cost_usd ?? 0) + row.cost_usd;
    }
    byKey.set(k, existing);
  }
  return [...byKey.values()];
}

function groupByUser(rows: UsageRow[]): AiUsageByUserRow[] {
  const byUser = new Map<string, AiUsageByUserRow>();
  for (const row of rows) {
    // Email/full_name enrichment needs an auth-MS lookup the gateway data
    // source doesn't have yet (AuthClientService has no get-user-by-id RPC)
    // — `null` is the package's documented "host has no data" signal, not a
    // bug. Follow-up: add `auth.getUser` and enrich in
    // GatewayAiUsageDataSource.
    const existing = byUser.get(row.user_id) ?? {
      user_id: row.user_id,
      email: null,
      calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: undefined,
    };
    existing.calls += 1;
    existing.input_tokens += row.input_tokens;
    existing.output_tokens += row.output_tokens;
    if (row.cost_usd != null) {
      existing.total_cost_usd = (existing.total_cost_usd ?? 0) + row.cost_usd;
    }
    byUser.set(row.user_id, existing);
  }
  return [...byUser.values()];
}

/**
 * Records `AiUsageRecord`s emitted by `app.module.ts`'s `onCall`/`onCost`
 * hooks into Supabase, and aggregates them into `AiUsageSummary`/
 * `AiUsageTimeseries` for `AiController`'s `ai.usage.*` message patterns.
 * Opt-in like `RagService`: missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 * degrades to a startup warning, not a crash — usage tracking must never
 * block `ai.generate`/`ai.orchestrate`.
 */
@Injectable()
export class AiUsageService implements OnModuleInit {
  private readonly logger = new Logger(AiUsageService.name);
  private client: SupabaseClient | null = null;
  private table = DEFAULT_TABLE;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit(): void {
    const url = this.cfg.get<string>('SUPABASE_URL');
    const key = this.cfg.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const missing = missingEnv(
      (k) => this.cfg.get<string>(k),
      [...(url ? [] : ['SUPABASE_URL']), ...(key ? [] : ['SUPABASE_SERVICE_ROLE_KEY'])],
    );

    if (missing.length > 0) {
      this.logger.warn(
        formatEnvBanner({
          service: 'ai-orchestrator AI usage tracking',
          provider: 'supabase',
          missing,
          envPath: 'apps/microservices/ai-orchestrator/.env',
          headline:
            '⚠  ai-orchestrator — AI usage tracking not configured (calls will not be recorded)',
        }),
      );
      return;
    }

    this.table = this.cfg.get<string>('AI_USAGE_SUPABASE_TABLE') ?? DEFAULT_TABLE;
    this.client = createClient(url as string, key as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Best-effort: a failed insert is logged, never thrown — a usage-tracking
   * outage must not fail the `ai.generate`/`ai.orchestrate` call it's
   * recording.
   */
  async record(record: AiUsageRecord): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.from(this.table).insert({
      created_at: record.timestamp,
      provider: record.provider,
      operation: record.operation,
      input_tokens: record.input_tokens,
      output_tokens: record.output_tokens,
      success: record.success,
      user_id: record.user_id,
      key_source: record.key_source,
      cost_usd: record.cost_usd ?? null,
    });
    if (error) {
      this.logger.warn(`Failed to record AI usage: ${error.message}`);
    }
  }

  async getSummary(range: AiUsageRange, userId?: string): Promise<AiUsageSummary> {
    const rows = await this.fetchRows(range, userId);
    const totalCost = rows.reduce((sum, r) => (r.cost_usd != null ? sum + r.cost_usd : sum), 0);
    return {
      total_calls: rows.length,
      total_input_tokens: rows.reduce((sum, r) => sum + r.input_tokens, 0),
      total_output_tokens: rows.reduce((sum, r) => sum + r.output_tokens, 0),
      success_count: rows.filter((r) => r.success).length,
      error_count: rows.filter((r) => !r.success).length,
      by_provider: groupBy(rows, 'provider'),
      by_operation: groupBy(rows, 'operation'),
      by_key_source: groupBy(rows, 'key_source'),
      by_user: groupByUser(rows),
      total_cost_usd: rows.some((r) => r.cost_usd != null) ? totalCost : undefined,
    };
  }

  async getTimeseries(range: AiUsageRange, userId?: string): Promise<AiUsageTimeseries> {
    const rows = await this.fetchRows(range, userId);
    const byDay = new Map<
      string,
      { calls: number; input_tokens: number; output_tokens: number; cost_usd: number | undefined }
    >();
    for (const row of rows) {
      const date = row.created_at.slice(0, 10);
      const existing = byDay.get(date) ?? {
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: undefined,
      };
      existing.calls += 1;
      existing.input_tokens += row.input_tokens;
      existing.output_tokens += row.output_tokens;
      if (row.cost_usd != null) existing.cost_usd = (existing.cost_usd ?? 0) + row.cost_usd;
      byDay.set(date, existing);
    }
    return {
      points: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, point]) => ({ date, ...point })),
    };
  }

  private async fetchRows(range: AiUsageRange, userId?: string): Promise<UsageRow[]> {
    if (!this.client) {
      throw new Error(
        'AI usage tracking is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/microservices/ai-orchestrator/.env',
      );
    }
    const since = new Date(Date.now() - RANGE_TO_MS[range]).toISOString();
    let query = this.client
      .from(this.table)
      .select(
        'provider, operation, input_tokens, output_tokens, success, user_id, key_source, cost_usd, created_at',
      )
      .gte('created_at', since);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as UsageRow[];
  }
}
