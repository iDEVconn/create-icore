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
  type SessionRecord,
  type SessionStore,
  type VerifiedToken,
} from '@icore/shared';
import { Public } from './public.decorator';
import { SkipCsrf } from '../http/skip-csrf.decorator';
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
  @SkipCsrf()
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
    return this.startSession(session, res, await this.resolveRole(session.accessToken));
  }

  @Public()
  @SkipCsrf()
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
    return this.startSession(session, res, await this.resolveRole(session.accessToken));
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
  // Unlike login/register/adopt (which cannot present a CSRF token yet
  // because they are the routes that ISSUE it), logout does already have
  // the cookies -- it is exempt deliberately: a forged logout is a minor
  // availability nuisance, not a compromise, and exempting it avoids a
  // chicken-and-egg dead end for a client that still holds a session
  // cookie but lost its CSRF cookie.
  @SkipCsrf()
  @Post('logout')
  @ApiOperation({ summary: 'End the server-side session and clear cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = readSessionId(req);
    if (sessionId) {
      let record: SessionRecord | null = null;
      try {
        record = await this.sessionStore.get(sessionId);
        // Delete the session record FIRST -- the moment this call returns,
        // the session is provably dead server-side even if the provider
        // revoke below fails. (Same ordering rationale as the old
        // clearCookies-after-best-effort-revoke logout, just applied to the
        // store instead of the cookie.)
        await this.sessionStore.delete(sessionId);
      } catch (err) {
        // Best-effort, exactly like the provider revoke below: a Redis blip
        // must not 500 the user out of a logout. The cookies are still
        // cleared, so the browser is logged out either way, and any record
        // that survived here dies on its own 30-day TTL.
        this.logger.warn('logout: session store unavailable, clearing cookies anyway', err);
      }
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
    const records = await this.sessionStore.deleteAllForUser(uid);
    await Promise.allSettled(
      records.map((record) =>
        this.authClient.revoke(record.providerRefreshToken).catch((err) => {
          this.logger.warn(
            `revokeUser: provider revoke failed for session ${record.sessionId}`,
            err,
          );
        }),
      ),
    );
    return { ok: true };
  }

  @Public()
  @SkipCsrf()
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
  @SkipCsrf()
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
    return this.startSession(session, res, await this.resolveRole(session.accessToken));
  }

  @Public()
  @SkipCsrf()
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
  @SkipCsrf()
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
    // Storing the OAuth anti-CSRF state nonce in an httpOnly, Secure (in
    // prod), SameSite cookie IS the correct, OWASP-recommended way to hold
    // this short-lived (10 min) value between the redirect-out and the
    // provider's callback -- it is never readable by client JS and never
    // sent over plain HTTP in prod. There is no server-side store to move it
    // to that would improve on the browser's own httpOnly cookie jar here.
    // codeql[js/clear-text-storage-of-sensitive-data]: see comment above -- httpOnly+Secure+SameSite cookie is the intended protection, not clear-text storage.
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @SkipCsrf()
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
    await this.startSessionRedirect(session, res, await this.resolveRole(session.accessToken));
  }

  /**
   * Resolves the provider's role claim for a freshly-issued access token.
   *
   * Before the BFF migration, `AuthGuard` called `authClient.verify(token)` on
   * EVERY request and read `VerifiedToken.role` straight off the result. That
   * call is gone from the hot path now (identity comes from the session
   * record), so the role has to be resolved explicitly at session-creation
   * time instead — otherwise `SessionRecord.role` stays `undefined` forever
   * and every `@CheckAbility` gate silently treats real admins as plain users.
   *
   * `AuthSession` (what login/signup/refresh return) carries no role field, so
   * one extra `auth.verify` RPC per session creation is the cheapest way to
   * get it without changing the `AuthStrategy` contract and all four concrete
   * strategies. It is once per login, not once per request — strictly fewer
   * verify() calls than the pre-BFF model made.
   *
   * Best-effort by design: the credentials were just accepted, so a verify()
   * blip must not turn a successful login into a 500. Degrading to
   * `undefined` fails CLOSED (no role => no admin ability), it never grants
   * anything.
   */
  private async resolveRole(accessToken: string): Promise<string | undefined> {
    try {
      const verified = await this.authClient.verify(accessToken);
      return verified.role;
    } catch (err) {
      this.logger.warn('role resolution failed — session starts with no role', err);
      return undefined;
    }
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
  private async startSessionRedirect(session: AuthSession, res: Response, role?: string) {
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
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    return res.redirect(`${origin}/dashboard`);
  }

  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
}
