import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { VerifiedToken } from '@icore/shared';
import { ProfileGatewayService, type ProfileView } from './profile-gateway.service';

type AuthedRequest = Request & { user?: VerifiedToken };

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileGatewayService) {}

  @Get()
  @ApiOperation({ summary: 'Return the authenticated user (uid / email / role / name)' })
  me(@Req() req: AuthedRequest): Promise<ProfileView> {
    return this.profile.get(req.user);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the display name of the authenticated user' })
  update(@Req() req: AuthedRequest, @Body() body: { name?: unknown }): Promise<ProfileView> {
    return this.profile.update(req.user, body?.name);
  }
}
