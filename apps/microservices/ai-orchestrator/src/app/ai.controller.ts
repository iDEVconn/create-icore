import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { LlmResponse } from '@idevconn/llm-router' with { 'resolution-mode': 'import' };
import { RagService } from './rag.service';

// See app.module.ts for why this is require(), not import — llm-router is
// ESM-only, this MS is strict CommonJS.
const { LlmRegistry, Orchestrator } = require('@idevconn/llm-router') as typeof import(
  '@idevconn/llm-router',
  { with: { 'resolution-mode': 'import' } }
);

interface GeneratePayload {
  prompt: string;
  provider?: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

interface OrchestratePayload {
  task: string;
  apiKeys?: Record<string, string>;
  maxRounds?: number;
  critique?: 'self' | 'cross';
  synthesize?: boolean;
  metaProvider?: string;
  maxConcurrency?: number;
  maxSubtasks?: number;
}

interface RagQueryPayload {
  query: string;
  topK?: number;
  filter?: Record<string, unknown>;
}

@Controller()
export class AiController {
  constructor(
    // Explicit @Inject rather than relying on constructor-param-type
    // inference: LlmRegistry/Orchestrator come from a require() (ESM
    // interop, see above), and TS's emitDecoratorMetadata is not
    // guaranteed to resolve a usable runtime reference for a type
    // expressed as InstanceType<typeof X> the way it does for a plain
    // `import { X }` class reference.
    @Inject(LlmRegistry) private readonly registry: InstanceType<typeof LlmRegistry>,
    @Inject(Orchestrator) private readonly orchestrator: InstanceType<typeof Orchestrator>,
    private readonly rag: RagService,
  ) {}

  @MessagePattern('ai.generate')
  async generate(@Payload() payload: GeneratePayload): Promise<LlmResponse> {
    const strategy = payload.provider
      ? this.registry.get(payload.provider)
      : this.registry.getPlatform();
    return strategy.generate({
      prompt: payload.prompt,
      systemPrompt: payload.systemPrompt,
      model: payload.model,
      maxTokens: payload.maxTokens,
      apiKey: payload.apiKey,
    });
  }

  @MessagePattern('ai.orchestrate')
  async orchestrate(@Payload() payload: OrchestratePayload) {
    const result = await this.orchestrator.run(payload.task, {
      apiKeys: payload.apiKeys,
      maxRounds: payload.maxRounds,
      critique: payload.critique,
      synthesize: payload.synthesize,
      metaProvider: payload.metaProvider,
      maxConcurrency: payload.maxConcurrency,
      maxSubtasks: payload.maxSubtasks,
    });

    return {
      subtasks: result.subtasks.map((s) => ({
        subtaskId: s.subtask.id,
        description: s.subtask.description,
        provider: s.decision?.provider,
        result: s.result,
        rounds: s.rounds,
        unresolved: s.unresolved,
        error: s.error,
      })),
      final: result.final,
      truncatedSubtaskCount: result.truncatedSubtaskCount,
      synthesisError: result.synthesisError,
    };
  }

  @MessagePattern('ai.rag.query')
  ragQuery(@Payload() payload: RagQueryPayload) {
    return this.rag.retrieve(payload.query, { topK: payload.topK, filter: payload.filter });
  }

  @MessagePattern('ai.providers')
  listProviders(): string[] {
    return this.registry.listProviderNames() as string[];
  }
}
