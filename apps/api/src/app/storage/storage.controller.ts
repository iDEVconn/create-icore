import { Body, Controller, Delete, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UploadClientService } from '@icore/upload-client';
import type { StorageRef, VerifiedToken } from '@icore/shared';
import type { Request } from 'express';
import { assertOwnership, assertSafeListPrefix } from './assert-ownership';

interface AuthedReq extends Request {
  user?: VerifiedToken;
}

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly uploadClient: UploadClientService) {}

  @Get('signed-url')
  @ApiOperation({ summary: 'Sign a StorageRef for short-lived download' })
  @ApiQuery({ name: 'bucket', type: String })
  @ApiQuery({ name: 'path', type: String })
  @ApiQuery({ name: 'ttlSec', type: Number, required: false })
  signedUrl(
    @Query('bucket') bucket: string,
    @Query('path') path: string,
    @Query('ttlSec') ttlSec: string | undefined,
    @Req() req: AuthedReq,
  ): Promise<string> {
    const ref: StorageRef = { bucket, path };
    assertOwnership(ref, req.user!.uid);
    return this.uploadClient.signedUrl(req.user!.uid, ref, ttlSec ? Number(ttlSec) : undefined);
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Delete a file the caller owns' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['bucket', 'path'],
      properties: { bucket: { type: 'string' }, path: { type: 'string' } },
    },
  })
  remove(@Body() body: { bucket: string; path: string }, @Req() req: AuthedReq): Promise<void> {
    const ref: StorageRef = { bucket: body.bucket, path: body.path };
    assertOwnership(ref, req.user!.uid);
    return this.uploadClient.remove(req.user!.uid, ref);
  }

  @Get('list')
  @ApiOperation({ summary: "List the caller's stored files" })
  @ApiQuery({ name: 'prefix', type: String, required: false })
  list(@Query('prefix') prefix: string | undefined, @Req() req: AuthedReq): Promise<StorageRef[]> {
    assertSafeListPrefix(prefix);
    return this.uploadClient.list(req.user!.uid, prefix);
  }
}
