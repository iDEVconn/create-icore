import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import OpenAI from 'openai';
import type { EmbeddingStrategy, RetrieveResult } from '@idevconn/llm-router' with {
  'resolution-mode': 'import',
};
import { missingEnv, formatEnvBanner } from '@icore/shared';

// See app.module.ts for why this is require(), not import — llm-router is
// ESM-only, this MS is strict CommonJS.
const { Retriever } = require('@idevconn/llm-router') as typeof import('@idevconn/llm-router', {
  with: { 'resolution-mode': 'import' },
});
const { PgVectorStore } = require('@idevconn/llm-router/embeddings/pgvector') as typeof import(
  '@idevconn/llm-router/embeddings/pgvector',
  { with: { 'resolution-mode': 'import' } }
);

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const TABLE_NAME = 'ai_orchestrator_embeddings';

/**
 * llm-router ships the `EmbeddingStrategy` contract but no concrete
 * implementation (unlike `LlmStrategy`, which has 5 adapters) — RAG needs
 * one, and OpenAI's embeddings endpoint is the cheapest widely-available
 * option, so it's implemented here rather than blocked on an upstream
 * adapter that doesn't exist yet.
 */
class OpenAiEmbeddingStrategy implements EmbeddingStrategy {
  readonly providerName = 'openai';
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}

/**
 * RAG is opt-in: it needs its own Postgres+pgvector instance
 * (`AI_RAG_POSTGRES_URL`) independent of whatever `dbProvider` the rest of
 * the project chose (that may be Supabase/Firebase/MongoDB/none — RAG must
 * not assume Postgres is the primary database). Missing config degrades to
 * a clear error at call time, not a startup crash — consistent with every
 * other strategy-with-fallback in this repo.
 */
@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private retriever: InstanceType<typeof Retriever> | null = null;

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const postgresUrl = this.cfg.get<string>('AI_RAG_POSTGRES_URL');
    const openaiKey = this.cfg.get<string>('OPENAI_API_KEY');
    const missing = missingEnv(
      (k) => this.cfg.get<string>(k),
      [...(postgresUrl ? [] : ['AI_RAG_POSTGRES_URL']), ...(openaiKey ? [] : ['OPENAI_API_KEY'])],
    );

    if (missing.length > 0) {
      this.logger.warn(
        formatEnvBanner({
          service: 'ai-orchestrator RAG',
          provider: 'pgvector',
          missing,
          envPath: 'apps/microservices/ai-orchestrator/.env',
          headline: '⚠  ai-orchestrator — RAG not configured (rag.query will fail)',
        }),
      );
      return;
    }

    const pool = new Pool({ connectionString: postgresUrl });
    try {
      await this.ensureTable(pool);
    } catch (err) {
      this.logger.error(
        `Failed to prepare the pgvector table — rag.query will fail until this is fixed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    this.retriever = new Retriever({
      embeddingStrategy: new OpenAiEmbeddingStrategy(openaiKey as string),
      vectorStore: new PgVectorStore({ pool, tableName: TABLE_NAME }),
    });
  }

  /**
   * `PgVectorStore` deliberately never runs DDL (see its doc comment) —
   * this is the one place that does, mirroring `PostgresAuthStrategy`'s
   * `ensureTables()`. `vector` extension + table + index creation are all
   * idempotent, so re-running on every boot is safe.
   */
  private async ensureTable(pool: Pool): Promise<void> {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id        TEXT PRIMARY KEY,
        embedding VECTOR(${EMBEDDING_DIMENSIONS}) NOT NULL,
        metadata  JSONB NOT NULL DEFAULT '{}'
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS ${TABLE_NAME}_embedding_idx
        ON ${TABLE_NAME} USING hnsw (embedding vector_cosine_ops)
    `);
  }

  isConfigured(): boolean {
    return this.retriever !== null;
  }

  async retrieve(
    query: string,
    opts?: { topK?: number; filter?: Record<string, unknown> },
  ): Promise<RetrieveResult> {
    if (!this.retriever) {
      throw new Error(
        'RAG is not configured — set AI_RAG_POSTGRES_URL and OPENAI_API_KEY in apps/microservices/ai-orchestrator/.env',
      );
    }
    return this.retriever.retrieve(query, opts);
  }
}
