import type { LlmGenerateOptions, LlmResponse, LlmStrategy } from '@idevconn/llm-router' with {
  'resolution-mode': 'import',
};

/**
 * In-memory `LlmStrategy` for tests — deterministic echo response, no
 * network call, no real API key. Mirrors `FakeAuthStrategy`/
 * `FakeStorageStrategy` in `@icore/shared`: same role, different contract
 * (llm-router's `LlmStrategy`, not an iCore strategy interface), which is
 * why this lives in `@icore/ai-client` instead of `@icore/shared` — `shared`
 * must not gain a hard dependency on `@idevconn/llm-router` since the AI
 * feature is optional and `shared` is not.
 */
export class FakeLlmStrategy implements LlmStrategy {
  readonly providerName: string;
  readonly defaultModel = 'fake-model';
  readonly capabilities = ['cheap'] as const;

  constructor(providerName = 'fake') {
    this.providerName = providerName;
  }

  async generate(opts: LlmGenerateOptions): Promise<LlmResponse> {
    return {
      text: `echo: ${opts.prompt}`,
      model: opts.model ?? this.defaultModel,
      usage: { inputTokens: opts.prompt.length, outputTokens: opts.prompt.length },
      truncated: false,
    };
  }

  async validateKey(): Promise<void> {
    // Always accepts — a fake key is never rejected.
  }

  hasPlatformKey(): boolean {
    return true;
  }
}
