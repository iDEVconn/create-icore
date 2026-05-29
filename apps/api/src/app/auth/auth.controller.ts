import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthClientService } from '@icore/auth-client';
import type { OAuthProvider } from '@icore/shared';
import { Public } from './public.decorator';

const OAUTH_PROVIDERS: ReadonlySet<OAuthProvider> = new Set(['google', 'github']);

function assertProvider(value: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.has(value as OAuthProvider)) {
    throw new UnauthorizedException(`unknown_oauth_provider: ${value}`);
  }
  return value as OAuthProvider;
}

// 10 auth-burst requests / 60s across register + login + refresh.
// Server-side gate against credential-stuffing; gateway only.
@ApiTags('auth')
@Controller('auth')
@Throttle({ 'auth-burst': { limit: 10, ttl: seconds(60) } })
export class AuthController {
  constructor(
    private readonly authClient: AuthClientService,
    private readonly cfg: ConfigService,
  ) {}

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

  @Public()
  @Post('magic-link')
  @ApiOperation({ summary: 'Send a passwordless sign-in link to the email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  })
  requestMagicLink(@Body() body: { email: string }) {
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const callbackUrl = `${origin}/auth/callback`;
    return this.authClient.sendMagicLink(body.email, callbackUrl);
  }

  @Public()
  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Exchange a magic-link token for an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string' } },
    },
  })
  verifyMagicLink(@Body() body: { token: string }) {
    return this.authClient.verifyMagicLink(body.token);
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start an OAuth flow — redirects to the provider' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthStart(@Param('provider') providerRaw: string, @Res() res: Response) {
    const provider = assertProvider(providerRaw);
    const origin = this.cfg.get<string>('API_ORIGIN') ?? 'http://localhost:3001';
    const callbackUrl = `${origin}/api/auth/oauth/${provider}/callback`;
    const { redirectUrl, state } = await this.authClient.startOAuth(provider, callbackUrl);
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.cfg.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'Provider redirected back — exchange code for session' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthCallback(
    @Param('provider') providerRaw: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = assertProvider(providerRaw);
    const cookieState = (req.cookies as Record<string, string> | undefined)?.['oauth_state'];
    if (!cookieState || cookieState !== state) {
      throw new UnauthorizedException('oauth_state_mismatch');
    }
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
  }
}
