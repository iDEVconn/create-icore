import { of } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { AiClientService } from '../ai-client.service';

function fakeClient(response: unknown): jest.Mocked<Pick<ClientProxy, 'send'>> {
  return { send: jest.fn().mockReturnValue(of(response)) };
}

describe('AiClientService', () => {
  it('sends ai.generate with the given input and returns the response', async () => {
    const client = fakeClient({
      text: 'hi',
      model: 'gemini-flash',
      usage: { inputTokens: 1, outputTokens: 1 },
      truncated: false,
    });
    const service = new AiClientService(client as unknown as ClientProxy);

    const result = await service.generate({ prompt: 'hello' });

    expect(client.send).toHaveBeenCalledWith('ai.generate', { prompt: 'hello' });
    expect(result.text).toBe('hi');
  });

  it('sends ai.orchestrate with the given input', async () => {
    const client = fakeClient({ subtasks: [] });
    const service = new AiClientService(client as unknown as ClientProxy);

    await service.orchestrate({ task: 'do the thing' });

    expect(client.send).toHaveBeenCalledWith('ai.orchestrate', { task: 'do the thing' });
  });

  it('sends ai.rag.query with the given input', async () => {
    const client = fakeClient({ chunks: [], sources: [] });
    const service = new AiClientService(client as unknown as ClientProxy);

    await service.ragQuery({ query: 'what is iCore' });

    expect(client.send).toHaveBeenCalledWith('ai.rag.query', { query: 'what is iCore' });
  });

  it('sends ai.providers with an empty payload', async () => {
    const client = fakeClient(['gemini', 'claude']);
    const service = new AiClientService(client as unknown as ClientProxy);

    const providers = await service.listProviders();

    expect(client.send).toHaveBeenCalledWith('ai.providers', {});
    expect(providers).toEqual(['gemini', 'claude']);
  });

  it('sends ai.usage.summary with the range and userId', async () => {
    const client = fakeClient({ total_calls: 3 });
    const service = new AiClientService(client as unknown as ClientProxy);

    const summary = await service.getUsageSummary('7d', 'user-1');

    expect(client.send).toHaveBeenCalledWith('ai.usage.summary', { range: '7d', userId: 'user-1' });
    expect(summary.total_calls).toBe(3);
  });

  it('sends ai.usage.timeseries with the range and no userId', async () => {
    const client = fakeClient({ points: [] });
    const service = new AiClientService(client as unknown as ClientProxy);

    await service.getUsageTimeseries('30d');

    expect(client.send).toHaveBeenCalledWith('ai.usage.timeseries', {
      range: '30d',
      userId: undefined,
    });
  });
});
