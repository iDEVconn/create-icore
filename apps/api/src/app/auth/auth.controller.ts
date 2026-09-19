import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
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
import type { OAuthProvider, VerifiedToken } from '@icore/shared';
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
  private readonly logger = new Logger(AuthController.name);

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
      } catch (err) {
        // Best-effort revoke: an MS/transport failure must not prevent the
        // cookie clear below — otherwise the client thinks it logged out
        // (its own try/catch swallows this) while the refresh cookie survives.
        // Logged so ops has visibility into a revoke that silently failed.
        this.logger.warn('logout: revoke failed, cookies still cleared', err);
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
  @Post('session/adopt')
  @ApiOperation({
    summary:
      'Adopt a Supabase-issued session (from the magic-link/OAuth implicit-flow hash fragment) by setting httpOnly cookies',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken', 'refreshToken'],
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  async adoptSession(
    @Body() body: { accessToken: string; refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Never trust that body.accessToken and body.refreshToken are actually a
    // matching pair -- a client could submit their OWN valid access token
    // alongside a stolen refresh token belonging to someone else, and if we
    // blindly cookied the stolen refresh token we'd hand them a path to that
    // victim's account on the next silent refresh (token substitution /
    // session fixation). Validate both independently, then require the
    // identity refresh() actually resolves to match the identity verify()
    // claims -- only a genuinely paired token pair can satisfy that.
    let verified: VerifiedToken;
    try {
      verified = await this.authClient.verify(body.accessToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    let refreshed;
    try {
      refreshed = await this.authClient.refresh(body.refreshToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    if (refreshed.user.id !== verified.uid) {
      throw new UnauthorizedException('invalid_token');
    }
    const csrfToken = generateCsrfToken();
    // Use the freshly-rotated pair from refresh() for the cookie/response --
    // never re-persist the client-supplied refreshToken itself (Supabase
    // already rotated it out from underneath us the moment refresh()
    // succeeded above, and it's best practice to never hand a
    // just-received-over-the-wire token pair straight to a persistent
    // httpOnly cookie unrotated).
    setAuthCookies(res, {
      refreshToken: refreshed.refreshToken,
      csrfToken,
      isProd: this.isProd(),
    });
    return {
      accessToken: refreshed.accessToken,
      user: { id: verified.uid, email: verified.email, role: verified.role },
    };
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
