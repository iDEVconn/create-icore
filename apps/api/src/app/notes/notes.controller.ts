import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { subject } from '@casl/ability';
import type { Request } from 'express';
import type { Note, VerifiedToken } from '@icore/shared';
import { NotesClientService } from '@icore/notes-client';
import { AbilityFactory } from '../abilities/ability.factory';
import { CheckAbility } from '../abilities/check-ability.decorator';

type AuthedRequest = Request & { user?: VerifiedToken };

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notes: NotesClientService,
    private readonly abilities: AbilityFactory,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notes (admin sees all, users see own)' })
  list(
    @Req() req: AuthedRequest,
    @Query('limit') limitRaw = '20',
    @Query('offset') offsetRaw = '0',
  ): Promise<{ items: Note[]; total: number }> {
    const ability = this.abilities.forUser(req.user);
    const ownerId = ability.can('manage', 'Note') ? null : (req.user?.uid ?? null);
    return this.notes.list({
      ownerId,
      limit: Math.min(100, Number(limitRaw) || 20),
      offset: Math.max(0, Number(offsetRaw) || 0),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a note by id' })
  async get(@Req() req: AuthedRequest, @Param('id') id: string): Promise<Note> {
    const note = await this.notes.get(id);
    if (!note) throw new NotFoundException();
    const ability = this.abilities.forUser(req.user);
    if (!ability.can('read', subject('Note', note) as never)) throw new ForbiddenException();
    return note;
  }

  @Post()
  @CheckAbility('create', 'Note')
  @ApiOperation({ summary: 'Create a note (ownerId is set from the session)' })
  create(@Req() req: AuthedRequest, @Body() body: { title: string; body: string }): Promise<Note> {
    if (!req.user) throw new ForbiddenException();
    return this.notes.create({
      ownerId: req.user.uid,
      title: body.title,
      body: body.body,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note (owner or admin only)' })
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() patch: { title?: string; body?: string },
  ): Promise<Note> {
    const note = await this.notes.get(id);
    if (!note) throw new NotFoundException();
    const ability = this.abilities.forUser(req.user);
    if (!ability.can('update', subject('Note', note) as never)) throw new ForbiddenException();
    return this.notes.update(id, patch);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a note (owner or admin only)' })
  async delete(@Req() req: AuthedRequest, @Param('id') id: string): Promise<void> {
    const note = await this.notes.get(id);
    if (!note) throw new NotFoundException();
    const ability = this.abilities.forUser(req.user);
    if (!ability.can('delete', subject('Note', note) as never)) throw new ForbiddenException();
    await this.notes.delete(id);
  }
}
