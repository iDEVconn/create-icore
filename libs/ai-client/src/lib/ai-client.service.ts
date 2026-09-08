import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { LlmResponse } from '@idevconn/llm-router' with { 'resolution-mode': 'import' };
import { AI_CLIENT } from './ai-client.tokens';

export interface GenerateInput {
  prompt: string;
  provider?: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

export interface OrchestrateInput {
  task: string;
  apiKeys?: Record<string, string>;
  maxRounds?: number;
  critique?: 'self' | 'cross';
  synthesize?: boolean;
  metaProvider?: string;
  maxConcurrency?: number;
  maxSubtasks?: number;
}

export interface OrchestrateSubtaskResult {
  subtaskId: string;
  description: string;
  provider?: string;
  result: string;
  rounds: number;
  unresolved: boolean;
  error?: string;
}

export interface OrchestrateResult {
  subtasks: OrchestrateSubtaskResult[];
  final?: string;
  truncatedSubtaskCount?: number;
  synthesisError?: string;
}

export interface RagQueryInput {
  query: string;
  topK?: number;
  filter?: Record<string, unknown>;
}

export interface RagQuerySource {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RagQueryResult {
  chunks: string[];
  sources: RagQuerySource[];
}

@Injectable()
export class AiClientService {
  constructor(@Inject(AI_CLIENT) private readonly client: ClientProxy) {}

  generate(input: GenerateInput): Promise<LlmResponse> {
    return firstValueFrom(this.client.send<LlmResponse>('ai.generate', input));
  }

  orchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
    return firstValueFrom(this.client.send<OrchestrateResult>('ai.orchestrate', input));
  }

  ragQuery(input: RagQueryInput): Promise<RagQueryResult> {
    return firstValueFrom(this.client.send<RagQueryResult>('ai.rag.query', input));
  }

  listProviders(): Promise<string[]> {
    return firstValueFrom(this.client.send<string[]>('ai.providers', {}));
  }
}
