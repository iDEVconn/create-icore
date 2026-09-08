import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import type { VerifiedToken } from '@icore/shared';
import {
  AiClientService,
  type GenerateInput,
  type OrchestrateInput,
  type RagQueryInput,
} from '@icore/ai-client';

type AuthedRequest = Request & { user?: VerifiedToken };

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
  generate(@Req() req: AuthedRequest, @Body() body: GenerateInput) {
    return this.ai.generate({ ...body, userId: req.user?.uid });
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
  orchestrate(@Req() req: AuthedRequest, @Body() body: OrchestrateInput) {
    return this.ai.orchestrate({ ...body, userId: req.user?.uid });
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
