import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { VerifiedToken } from '@icore/shared';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  @Get()
  @ApiOperation({ summary: 'Return the authenticated user (uid / email / role)' })
  me(@Req() req: Request & { user?: VerifiedToken }): VerifiedToken | undefined {
    return req.user;
  }
}
