import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  AiClientService,
  type GenerateInput,
  type OrchestrateInput,
  type RagQueryInput,
} from '@icore/ai-client';

@ApiBearerAuth()
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiClientService) {}

  @Post('generate')
  @Throttle({ 'ai-burst': { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Generate a single LLM completion' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        provider: { type: 'string', example: 'gemini' },
        systemPrompt: { type: 'string' },
        model: { type: 'string' },
        maxTokens: { type: 'number' },
      },
    },
  })
  generate(@Body() body: GenerateInput) {
    return this.ai.generate(body);
  }

  @Post('orchestrate')
  @Throttle({ 'ai-burst': { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Decompose a task into subtasks, route/critique/synthesize' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['task'],
      properties: {
        task: { type: 'string' },
        maxRounds: { type: 'number' },
        critique: { type: 'string', enum: ['self', 'cross'] },
        synthesize: { type: 'boolean' },
      },
    },
  })
  orchestrate(@Body() body: OrchestrateInput) {
    return this.ai.orchestrate(body);
  }

  @Post('rag/query')
  @ApiOperation({ summary: 'Retrieve the top-K sanitized chunks for a query' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        topK: { type: 'number' },
      },
    },
  })
  ragQuery(@Body() body: RagQueryInput) {
    return this.ai.ragQuery(body);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List the LLM providers registered on the MS' })
  listProviders(): Promise<string[]> {
    return this.ai.listProviders();
  }
}
