import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadClientService } from '@icore/upload-client';
import type { StorageRef, VerifiedToken } from '@icore/shared';
import type { Request } from 'express';
import { assertOwnership } from './assert-ownership';

interface AuthedReq extends Request {
  user?: VerifiedToken;
}

const DEFAULT_MAX_KB = 5120;

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageFilesController {
  constructor(
    private readonly uploadClient: UploadClientService,
    private readonly cfg: ConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file and return its StorageRef' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedReq,
  ): Promise<StorageRef> {
    if (!file) throw new BadRequestException('missing_file');
    const maxKb = Number(this.cfg.get<string>('MAX_FILE_SIZE_KB') ?? DEFAULT_MAX_KB);
    if (file.size > maxKb * 1024) {
      throw new PayloadTooLargeException(`file exceeds ${maxKb} KB`);
    }
    return this.uploadClient.upload(req.user!.uid, {
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Get('file')
  @ApiOperation({ summary: 'Download a file proxied through the gateway (GridFS providers)' })
  @ApiQuery({ name: 'bucket', type: String })
  @ApiQuery({ name: 'path', type: String })
  @ApiResponse({
    status: 200,
    description: 'Raw file bytes',
    content: { 'application/octet-stream': {} },
  })
  async downloadFile(
    @Query('bucket') bucket: string,
    @Query('path') path: string,
    @Req() req: AuthedReq,
  ): Promise<StreamableFile> {
    const ref: StorageRef = { bucket, path };
    assertOwnership(ref, req.user!.uid);
    const buffer = await this.uploadClient.downloadBuffer(req.user!.uid, ref);
    if (!buffer) throw new NotFoundException('storage_provider_does_not_support_direct_download');
    const filename = path.split('/').pop() ?? 'file';
    return new StreamableFile(buffer, {
      type: 'application/octet-stream',
      disposition: `inline; filename="${filename}"`,
    });
  }
}
