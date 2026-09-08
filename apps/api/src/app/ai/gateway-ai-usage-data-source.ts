import { Injectable } from '@nestjs/common';
import type { AiUsageDataSource } from '@idevconn/ai-usage/server';
import type { AiUsageRange, AiUsageSummary, AiUsageTimeseries } from '@idevconn/ai-usage';
import { AiClientService } from '@icore/ai-client';

/**
 * The gateway never talks to Supabase directly (see AGENTS.md — traffic
 * goes gateway → microservice → strategy). `AiUsageService` on the
 * ai-orchestrator MS owns the real Supabase-backed aggregation; this class
 * just forwards `AiUsageModule`'s calls over the existing `ai.usage.*`
 * message patterns.
 */
@Injectable()
export class GatewayAiUsageDataSource implements AiUsageDataSource {
  constructor(private readonly ai: AiClientService) {}

  getSummary(range: AiUsageRange, userId?: string): Promise<AiUsageSummary> {
    return this.ai.getUsageSummary(range, userId);
  }

  getTimeseries(range: AiUsageRange, userId?: string): Promise<AiUsageTimeseries> {
    return this.ai.getUsageTimeseries(range, userId);
  }
}
