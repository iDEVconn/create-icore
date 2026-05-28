import { Body, Controller, Post } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthClientService } from '@icore/auth-client';
import { Public } from './public.decorator';

// 10 auth-burst requests / 60s across register + login + refresh.
// Server-side gate against credential-stuffing; gateway only.
@ApiTags('auth')
@Controller('auth')
@Throttle({ 'auth-burst': { limit: 10, ttl: seconds(60) } })
export class AuthController {
  constructor(private readonly authClient: AuthClientService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a new user and return an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
    },
  })
  register(@Body() body: { email: string; password: string }) {
    return this.authClient.signup(body.email, body.password);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange email + password for an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
    },
  })
  login(@Body() body: { email: string; password: string }) {
    return this.authClient.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authClient.refresh(body.refreshToken);
  }
}
