import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { VerifiedToken } from '@icore/shared';
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

function req(user?: VerifiedToken): Request & { user?: VerifiedToken } {
  return { user } as unknown as Request & { user?: VerifiedToken };
}

describe('AiController (gateway)', () => {
  it('generate forwards the body plus the authenticated userId to AiClientService', async () => {
    const { ai, controller } = fixture();
    const result = await controller.generate(req({ uid: 'user-1', role: 'user' }), {
      prompt: 'hello',
    });
    expect(ai.generate).toHaveBeenCalledWith({ prompt: 'hello', userId: 'user-1' });
    expect(result.text).toBe('hi');
  });

  it('orchestrate forwards the body plus the authenticated userId to AiClientService', async () => {
    const { ai, controller } = fixture();
    await controller.orchestrate(req({ uid: 'user-1', role: 'user' }), { task: 'do the thing' });
    expect(ai.orchestrate).toHaveBeenCalledWith({ task: 'do the thing', userId: 'user-1' });
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
