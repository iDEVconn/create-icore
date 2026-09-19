import {
  Body,
  Controller,
  Get,
  Inject,
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
  generateCsrfToken,
  readSessionId,
  setSessionCookie,
  clearSessionCookie,
  type AuthSession,
  type OAuthProvider,
  type SessionStore,
  type VerifiedToken,
} from '@icore/shared';
import { Public } from './public.decorator';
import { CheckAbility } from '../abilities/check-ability.decorator';
import { SESSION_STORE } from '../session/session-store.provider';

const OAUTH_PROVIDERS: ReadonlySet<OAuthProvider> = new Set(['google', 'github']);
const CSRF_COOKIE = 'icore_csrf';

function assertProvider(value: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.has(value as OAuthProvider)) {
    throw new UnauthorizedException(`unknown_oauth_provider: ${value}`);
  }
  return value as OAuthProvider;
}

@ApiTags('auth')
@Controller('auth')
@Throttle({ 'auth-burst': { limit: 10, ttl: seconds(60) } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authClient: AuthClientService,
    private readonly cfg: ConfigService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a new user and start a server-side session' })
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
    return this.startSession(session, res);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange email + password for a server-side session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
    },
  })
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.login(body.email, body.password);
    return this.startSession(session, res);
  }

  @Get('session')
  @ApiOperation({ summary: 'Resolve the current session cookie into a user, or 401' })
  async getSession(@Req() req: Request) {
    // AuthGuard already resolved+refreshed by the time this handler runs;
    // it populated req.user in exactly the VerifiedToken shape.
    const user = (req as Request & { user?: VerifiedToken }).user;
    if (!user) throw new UnauthorizedException('invalid_session');
    return { user: { id: user.uid, email: user.email, role: user.role } };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'End the server-side session and clear cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = readSessionId(req);
    if (sessionId) {
      const record = await this.sessionStore.get(sessionId);
      // Delete the session record FIRST -- the moment this call returns,
      // the session is provably dead server-side even if the provider
      // revoke below fails. (Same ordering rationale as the old
      // clearCookies-after-best-effort-revoke logout, just applied to the
      // store instead of the cookie.)
      await this.sessionStore.delete(sessionId);
      if (record) {
        try {
          await this.authClient.revoke(record.providerRefreshToken);
        } catch (err) {
          this.logger.warn('logout: provider revoke failed, session already deleted', err);
        }
      }
    }
    clearSessionCookie(res, this.isProd());
    res.clearCookie(CSRF_COOKIE, { path: '/', secure: this.isProd() });
    return { ok: true };
  }

  @Post('admin/revoke-user/:uid')
  @CheckAbility('manage', 'User')
  @ApiOperation({ summary: 'Immediately kill every active session for a user (admin only)' })
  async revokeUser(@Param('uid') uid: string) {
    await this.sessionStore.deleteAllForUser(uid);
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
    return this.authClient.sendMagicLink(body.email, `${origin}/auth/callback`);
  }

  @Public()
  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Exchange a magic-link token for a server-side session' })
  @ApiBody({
    schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
  })
  async verifyMagicLink(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.verifyMagicLink(body.token);
    return this.startSession(session, res);
  }

  @Public()
  @Post('session/adopt')
  @ApiOperation({
    summary:
      'Adopt a Supabase implicit-flow session (from a URL hash fragment) as a server-side session',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accessToken', 'refreshToken'],
      properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
    },
  })
  async adoptSession(
    @Body() body: { accessToken: string; refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Same token-substitution defense as before Task 5 (see PR #324):
    // verify() and refresh() are independent calls; only a genuinely
    // paired token pair can satisfy refreshed.user.id === verified.uid.
    let verified: VerifiedToken;
    try {
      verified = await this.authClient.verify(body.accessToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    let refreshed: AuthSession;
    try {
      refreshed = await this.authClient.refresh(body.refreshToken);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    if (refreshed.user.id !== verified.uid) throw new UnauthorizedException('invalid_token');
    return this.startSession(refreshed, res, verified.role);
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start an OAuth flow — redirects to the provider' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthStart(@Param('provider') providerRaw: string, @Res() res: Response) {
    const provider = assertProvider(providerRaw);
    const origin = this.cfg.get<string>('API_ORIGIN') ?? 'http://localhost:3001';
    const { redirectUrl, state } = await this.authClient.startOAuth(
      provider,
      `${origin}/api/auth/oauth/${provider}/callback`,
    );
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'Provider redirected back — exchange code for a server-side session' })
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
    if (!cookieState || cookieState !== state)
      throw new UnauthorizedException('oauth_state_mismatch');
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    await this.startSessionRedirect(session, res);
  }

  private async startSession(session: AuthSession, res: Response, role?: string) {
    const record = await this.sessionStore.create({
      uid: session.user.id,
      email: session.user.email,
      role,
      providerAccessToken: session.accessToken,
      providerRefreshToken: session.refreshToken,
      providerAccessTokenExpiresAt: Date.now() + session.expiresIn * 1000,
    });
    setSessionCookie(res, record.sessionId, this.isProd());
    const csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE, csrfToken, {
      path: '/',
      secure: this.isProd(),
      sameSite: this.isProd() ? 'none' : 'lax',
      // Must match icore_sid's lifetime (SESSION_COOKIE_MAX_AGE_MS in
      // session-cookie.ts) -- otherwise a returning user with a still-valid
      // session cookie loses the CSRF cookie on browser restart and every
      // CSRF-protected mutating request fails despite a valid session.
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { user: { id: session.user.id, email: session.user.email, role } };
  }

  // OAuth's own callback ends in a redirect, not a JSON body, so it sets
  // cookies then bounces the browser back to the SPA -- no tokens in the
  // URL fragment at all now (unlike the pre-BFF version), since there is
  // nothing left for client JS to read.
  private async startSessionRedirect(session: AuthSession, res: Response) {
    const record = await this.sessionStore.create({
      uid: session.user.id,
      email: session.user.email,
      providerAccessToken: session.accessToken,
      providerRefreshToken: session.refreshToken,
      providerAccessTokenExpiresAt: Date.now() + session.expiresIn * 1000,
    });
    setSessionCookie(res, record.sessionId, this.isProd());
    const csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE, csrfToken, {
      path: '/',
      secure: this.isProd(),
      sameSite: this.isProd() ? 'none' : 'lax',
      // Must match icore_sid's lifetime (SESSION_COOKIE_MAX_AGE_MS in
      // session-cookie.ts) -- otherwise a returning user with a still-valid
      // session cookie loses the CSRF cookie on browser restart and every
      // CSRF-protected mutating request fails despite a valid session.
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    return res.redirect(`${origin}/dashboard`);
  }

  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
}
