import { describe, expect, it, vi } from 'vitest';
import { AiClientService } from '@icore/ai-client';
import { AiController } from '../ai.controller';

function fixture() {
  const ai = {
    generate: vi.fn().mockResolvedValue({ text: 'hi', model: 'gemini-flash' }),
    orchestrate: vi.fn().mockResolvedValue({ subtasks: [] }),
    ragQuery: vi.fn().mockResolvedValue({ chunks: [], sources: [] }),
    listProviders: vi.fn().mockResolvedValue(['gemini', 'claude']),
  } as unknown as AiClientService;
  return { ai, controller: new AiController(ai) };
}

describe('AiController (gateway)', () => {
  it('generate forwards the body to AiClientService', async () => {
    const { ai, controller } = fixture();
    const result = await controller.generate({ prompt: 'hello' });
    expect(ai.generate).toHaveBeenCalledWith({ prompt: 'hello' });
    expect(result.text).toBe('hi');
  });

  it('orchestrate forwards the body to AiClientService', async () => {
    const { ai, controller } = fixture();
    await controller.orchestrate({ task: 'do the thing' });
    expect(ai.orchestrate).toHaveBeenCalledWith({ task: 'do the thing' });
  });

  it('ragQuery forwards the body to AiClientService', async () => {
    const { ai, controller } = fixture();
    await controller.ragQuery({ query: 'what is iCore' });
    expect(ai.ragQuery).toHaveBeenCalledWith({ query: 'what is iCore' });
  });

  it('listProviders returns AiClientService.listProviders', async () => {
    const { controller } = fixture();
    await expect(controller.listProviders()).resolves.toEqual(['gemini', 'claude']);
  });
});
