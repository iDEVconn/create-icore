import {
  Body,
  Controller,
  ForbiddenException,
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
import {
  setAuthCookies,
  generateCsrfToken,
  readRefreshToken,
  verifyCsrf,
  clearAuthCookies,
} from '@icore/shared';
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
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.signup(body.email, body.password);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
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
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.login(body.email, body.password);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the httpOnly refresh cookie for a fresh access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('invalid_refresh_token');
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    const session = await this.authClient.refresh(refreshToken);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    // 'refreshToken' is a sentinel, NOT a real token — the real token never
    // leaves the httpOnly cookie. @idevconn/api-client's doRefresh() hard-requires
    // a string refreshTokenField in the response body to accept the refresh as
    // successful (see create-api.ts's matching refreshTokenField: 'refreshToken').
    return { accessToken: session.accessToken, refreshToken: 'cookie', user: session.user };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh cookie, ending that session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      try {
        await this.authClient.revoke(refreshToken);
      } catch {
        // Best-effort revoke: an MS/transport failure must not prevent the
        // cookie clear below — otherwise the client thinks it logged out
        // (its own try/catch swallows this) while the refresh cookie survives.
      }
    }
    clearAuthCookies(res, { isProd: this.isProd() });
    return { ok: true };
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
  async verifyMagicLink(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.verifyMagicLink(body.token);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
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
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
  }

  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
}
