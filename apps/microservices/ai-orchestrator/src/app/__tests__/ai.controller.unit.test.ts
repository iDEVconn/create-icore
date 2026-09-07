import { describe, expect, it, vi } from 'vitest';
import { LlmRegistry, type Orchestrator } from '@idevconn/llm-router';
import { FakeLlmStrategy } from '@icore/ai-client';
import { AiController } from '../ai.controller';
import type { RagService } from '../rag.service';

// A real Orchestrator.run() decomposes the task via an LLM call first —
// FakeLlmStrategy just echoes text back, which isn't parseable JSON, so
// decompose() always fails against it. The controller's job is to flatten
// whatever Orchestrator.run() returns into a plain DTO, not to re-verify
// Orchestrator's own decompose/critique behavior (that's llm-router's own
// test suite, not this repo's) — so this mocks run() directly.
function fixture() {
  const fake = new FakeLlmStrategy('fake');
  const registry = new LlmRegistry({ strategies: [fake], platform: 'fake' });
  const orchestrator = { run: vi.fn() } as unknown as Orchestrator;
  const rag = { retrieve: vi.fn() } as unknown as RagService;
  return {
    fake,
    registry,
    orchestrator,
    rag,
    controller: new AiController(registry, orchestrator, rag),
  };
}

describe('AiController', () => {
  it('generate forwards to the platform strategy when no provider is given', async () => {
    const { controller } = fixture();
    const result = await controller.generate({ prompt: 'hello' });
    expect(result.text).toBe('echo: hello');
  });

  it('generate forwards to a named provider', async () => {
    const { controller } = fixture();
    const result = await controller.generate({ prompt: 'hi', provider: 'fake' });
    expect(result.text).toBe('echo: hi');
  });

  it('generate rejects an unknown provider', async () => {
    const { controller } = fixture();
    await expect(controller.generate({ prompt: 'hi', provider: 'nope' })).rejects.toThrow();
  });

  it('orchestrate flattens subtask results into a plain DTO', async () => {
    const { controller, orchestrator } = fixture();
    (orchestrator.run as ReturnType<typeof vi.fn>).mockResolvedValue({
      subtasks: [
        {
          subtask: { id: 's1', description: 'do a single thing' },
          decision: { subtaskId: 's1', provider: 'fake', method: 'rule' },
          result: 'done',
          rounds: 0,
          unresolved: false,
        },
      ],
      final: 'final answer',
      truncatedSubtaskCount: 0,
    });

    const result = await controller.orchestrate({ task: 'do a single thing', maxRounds: 0 });

    expect(result.subtasks).toEqual([
      {
        subtaskId: 's1',
        description: 'do a single thing',
        provider: 'fake',
        result: 'done',
        rounds: 0,
        unresolved: false,
        error: undefined,
      },
    ]);
    expect(result.final).toBe('final answer');
  });

  it('ragQuery forwards to RagService.retrieve', async () => {
    const { controller, rag } = fixture();
    (rag.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({ chunks: ['a'], sources: [] });
    const result = await controller.ragQuery({ query: 'what is iCore', topK: 3 });
    expect(rag.retrieve).toHaveBeenCalledWith('what is iCore', { topK: 3, filter: undefined });
    expect(result.chunks).toEqual(['a']);
  });

  it('listProviders returns the registry contents', () => {
    const { controller } = fixture();
    expect(controller.listProviders()).toEqual(['fake']);
  });
});
