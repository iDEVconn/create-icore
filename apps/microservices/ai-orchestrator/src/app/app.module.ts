import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { LlmStrategy, PricingTable } from '@idevconn/llm-router' with {
  'resolution-mode': 'import',
};
import type { AiUsageRecord } from '@idevconn/ai-usage';
import { AiController } from './ai.controller';
import { RagService } from './rag.service';
import { AiUsageService } from './ai-usage.service';
import { aiUsageContext } from './ai-usage.context';
import { AiUsageDbProviderModule } from './ai-usage-db.provider';

// @idevconn/llm-router is ESM-only ("type": "module") but NestJS
// microservices in this repo are strict CommonJS (AGENTS.md — module/
// moduleResolution: node16, required for decorator metadata). `import`
// syntax against an ESM package here fails at compile time (TS1479).
// `require()` works because Node 22.12+/24 supports synchronous
// require() of an ESM module natively — `.nvmrc`/every Dockerfile pin
// Node 24, so this is safe at runtime. `typeof import(...)` keeps full
// type-checking on the require() result without emitting an ESM import.
const llmRouter = require('@idevconn/llm-router') as typeof import('@idevconn/llm-router', {
  with: { 'resolution-mode': 'import' },
});
const { GeminiStrategy } = require('@idevconn/llm-router/gemini') as typeof import(
  '@idevconn/llm-router/gemini',
  { with: { 'resolution-mode': 'import' } }
);
const { ClaudeStrategy } = require('@idevconn/llm-router/claude') as typeof import(
  '@idevconn/llm-router/claude',
  { with: { 'resolution-mode': 'import' } }
);
const { ChatGptStrategy } = require('@idevconn/llm-router/chatgpt') as typeof import(
  '@idevconn/llm-router/chatgpt',
  { with: { 'resolution-mode': 'import' } }
);
const { LlmRegistry, Orchestrator, withBudget, withInstrumentation, calculateCost } = llmRouter;

const ENV_PATHS = [
  join(process.cwd(), 'apps/microservices/ai-orchestrator/.env'),
  join(process.cwd(), '.env'),
];

const PROVIDER_ENV_KEYS = {
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  chatgpt: 'OPENAI_API_KEY',
};

/**
 * `AI_PRICING_JSON` (a JSON-encoded `PricingTable`) is required to enable
 * cost enforcement — pricing is not hardcoded here, since model prices
 * change and a stale hardcoded table would silently under/over-enforce a
 * budget. Without it, `AI_MAX_COST_PER_CALL`/`AI_MAX_COST_TOTAL` are ignored
 * (logged once) rather than applied against numbers nobody vouched for.
 */
function readPricingTable(cfg: ConfigService, logger: Logger): PricingTable | undefined {
  const raw = cfg.get<string>('AI_PRICING_JSON');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PricingTable;
  } catch {
    logger.warn('AI_PRICING_JSON is not valid JSON — cost enforcement disabled.');
    return undefined;
  }
}

/**
 * The `AiUsageCallContext` (operation/userId/keySource) is request-scoped —
 * `AiController` opens it per `@MessagePattern` handler via
 * `aiUsageContext.run()` — while this wrapper is built once per strategy at
 * module init and shared across every request. Reading
 * `aiUsageContext.getStore()` inside `onCall` is what ties a usage row back
 * to the call that produced it; a call made outside any context (there
 * shouldn't be one — every handler that touches an LLM strategy opens a
 * context) is tagged 'unknown' rather than dropped, so a future missed spot
 * is visible in the dashboard instead of silently losing data.
 */
function instrumentAndBudget(
  strategy: LlmStrategy,
  cfg: ConfigService,
  logger: Logger,
  aiUsage: AiUsageService,
): LlmStrategy {
  const pricing = readPricingTable(cfg, logger);

  let wrapped = withInstrumentation(strategy, {
    onCall: (event) => {
      if (event.error) {
        logger.warn(
          `${event.provider}/${event.model} failed after ${event.latencyMs}ms: ${event.error}`,
        );
      } else {
        logger.log(
          `${event.provider}/${event.model} — ${event.usage.inputTokens}in/${event.usage.outputTokens}out tokens, ${event.latencyMs}ms${event.truncated ? ' (truncated)' : ''}`,
        );
      }

      const ctx = aiUsageContext.getStore();
      const record: AiUsageRecord = {
        timestamp: event.timestamp,
        provider: event.provider,
        operation: ctx?.operation ?? 'unknown',
        input_tokens: event.usage.inputTokens,
        output_tokens: event.usage.outputTokens,
        success: !event.error,
        user_id: ctx?.userId ?? 'unknown',
        key_source: ctx?.keySource ?? 'platform',
        cost_usd: pricing
          ? calculateCost(event.usage, event.provider, event.model, pricing)
          : undefined,
      };
      aiUsage.record(record).catch((err: unknown) => {
        logger.warn(
          `Failed to record AI usage: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    },
  });

  const maxCostPerCall = cfg.get<string>('AI_MAX_COST_PER_CALL');
  const maxCostTotal = cfg.get<string>('AI_MAX_COST_TOTAL');
  if (pricing && (maxCostPerCall || maxCostTotal)) {
    wrapped = withBudget(wrapped, {
      pricing,
      maxCostPerCall: maxCostPerCall ? Number(maxCostPerCall) : undefined,
      maxCostTotal: maxCostTotal ? Number(maxCostTotal) : undefined,
      onCost: (event) =>
        logger.log(`${event.provider}/${event.model} cost $${event.cost.toFixed(4)}`),
    });
  } else if (maxCostPerCall || maxCostTotal) {
    logger.warn(
      'AI_MAX_COST_PER_CALL/AI_MAX_COST_TOTAL set without AI_PRICING_JSON — budget enforcement disabled.',
    );
  }

  return wrapped;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ENV_PATHS,
    }),
    AiUsageDbProviderModule,
  ],
  controllers: [AiController],
  providers: [
    AiUsageService,
    {
      provide: LlmRegistry,
      useFactory: (cfg: ConfigService, aiUsage: AiUsageService) => {
        const logger = new Logger('LlmRegistry');
        const platform = (cfg.get<string>('AI_PROVIDER') ?? 'gemini').trim();

        const strategies: LlmStrategy[] = [
          instrumentAndBudget(
            new GeminiStrategy({ apiKey: cfg.get<string>('GEMINI_API_KEY') }),
            cfg,
            logger,
            aiUsage,
          ),
          instrumentAndBudget(
            new ClaudeStrategy({ apiKey: cfg.get<string>('ANTHROPIC_API_KEY') }),
            cfg,
            logger,
            aiUsage,
          ),
          instrumentAndBudget(
            new ChatGptStrategy({ apiKey: cfg.get<string>('OPENAI_API_KEY') }),
            cfg,
            logger,
            aiUsage,
          ),
        ];

        return new LlmRegistry({
          strategies,
          platform,
          providerEnvKeys: PROVIDER_ENV_KEYS,
          providerLabels: { gemini: 'Gemini', claude: 'Claude', chatgpt: 'ChatGPT' },
          logger,
        });
      },
      inject: [ConfigService, AiUsageService],
    },
    {
      provide: Orchestrator,
      useFactory: (registry: InstanceType<typeof LlmRegistry>) => new Orchestrator({ registry }),
      inject: [LlmRegistry],
    },
    RagService,
  ],
})
export class AppModule {}
