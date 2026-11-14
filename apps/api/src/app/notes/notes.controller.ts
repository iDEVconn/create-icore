import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Optional,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Note, VerifiedToken } from '@icore/shared';
import { NotesClientService } from '@icore/notes-client';
import { AbilityFactory } from '../abilities/ability.factory';
import { CheckAbility } from '../abilities/check-ability.decorator';
import { NotesGatewayService } from './notes-gateway.service';

type AuthedRequest = Request & { user?: VerifiedToken };

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  private readonly gateway: NotesGatewayService;

  constructor(
    notes: NotesClientService,
    abilities: AbilityFactory,
    @Optional() gateway?: NotesGatewayService,
  ) {
    this.gateway = gateway ?? new NotesGatewayService(notes, abilities);
  }

  @Get()
  @ApiOperation({ summary: 'List notes (admin sees all, users see own)' })
  list(
    @Req() req: AuthedRequest,
    @Query('limit') limitRaw = '20',
    @Query('offset') offsetRaw = '0',
  ): Promise<{ items: Note[]; total: number }> {
    return this.gateway.list(req.user, { limit: Number(limitRaw), offset: Number(offsetRaw) });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a note by id' })
  get(@Req() req: AuthedRequest, @Param('id') id: string): Promise<Note> {
    return this.gateway.get(req.user, id);
  }

  @Post()
  @CheckAbility('create', 'Note')
  @ApiOperation({ summary: 'Create a note (ownerId is set from the session)' })
  create(@Req() req: AuthedRequest, @Body() body: { title: string; body: string }): Promise<Note> {
    return this.gateway.create(req.user, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note (owner or admin only)' })
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() patch: { title?: string; body?: string },
  ): Promise<Note> {
    return this.gateway.update(req.user, id, patch);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a note (owner or admin only)' })
  delete(@Req() req: AuthedRequest, @Param('id') id: string): Promise<void> {
    return this.gateway.remove(req.user, id);
  }
}
