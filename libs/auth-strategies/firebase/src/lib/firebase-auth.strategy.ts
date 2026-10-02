import { randomUUID } from 'node:crypto';
import { RpcException } from '@nestjs/microservices';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';
import type { IdentityToolkitClient, OAuthTokenClient } from './identity-toolkit.client';

export interface OAuthProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface FirebaseOAuthConfig {
  google?: OAuthProviderCredentials;
  github?: OAuthProviderCredentials;
}

interface PendingState {
  provider: OAuthProvider;
  callbackUrl: string;
}

/**
 * Identity Toolkit's `securetoken.googleapis.com/v1/token` error codes that
 * mean the refresh token itself is dead. `HttpIdentityToolkitClient` surfaces
 * them verbatim as the thrown Error's message (see identity-toolkit.client.ts
 * — it rethrows `payload.error.message`).
 */
const IDENTITY_TOOLKIT_REJECTION_CODES = [
  'INVALID_REFRESH_TOKEN',
  'MISSING_REFRESH_TOKEN',
  'TOKEN_EXPIRED',
  'USER_DISABLED',
  'USER_NOT_FOUND',
  'INVALID_GRANT_TYPE',
] as const;

/**
 * Only a known rejection code may be normalized to `invalid_refresh_token` —
 * that message makes `AuthGuard` DELETE the session and force a re-login.
 * A DNS failure, a socket timeout or a `firebase_refresh_failed_503` must NOT
 * take a valid session down with it; those propagate unchanged so the guard
 * answers 503 and keeps the session.
 */
function isIdentityToolkitRejection(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toUpperCase();
  return IDENTITY_TOOLKIT_REJECTION_CODES.some((code) => message.includes(code));
}

const INVALID_OOB_CODES = ['INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'] as const;

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).toUpperCase();
}

function isInvalidOobCode(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toUpperCase();
  return INVALID_OOB_CODES.some((code) => message.includes(code));
}

export interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(
    uid: string,
  ): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
  /** Invalidates every refresh token currently issued to this uid (Firebase has
   *  no per-session revoke primitive — this is always uid-wide, unlike
   *  Supabase's/postgres's per-refresh-token revoke). */
  revokeRefreshTokens(uid: string): Promise<void>;
  getUserByEmail(email: string): Promise<{ uid: string }>;
}

export interface FirebaseAuthStrategyOptions {
  identityToolkit: IdentityToolkitClient;
  adminAuth: FirebaseAdminAuthLike;
  oauth?: FirebaseOAuthConfig;
  oauthTokenClient?: OAuthTokenClient;
}

export class FirebaseAuthStrategy implements AuthStrategy {
  private readonly identityToolkit: IdentityToolkitClient;
  private readonly adminAuth: FirebaseAdminAuthLike;
  private readonly oauth: FirebaseOAuthConfig;
  private readonly oauthTokenClient: OAuthTokenClient | null;
  private readonly pendingStates = new Map<string, PendingState>();

  constructor(opts: FirebaseAuthStrategyOptions) {
    this.identityToolkit = opts.identityToolkit;
    this.adminAuth = opts.adminAuth;
    this.oauth = opts.oauth ?? {};
    this.oauthTokenClient = opts.oauthTokenClient ?? null;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signUp(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signIn(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let res;
    try {
      res = await this.identityToolkit.refresh(refreshToken);
    } catch (err) {
      if (isIdentityToolkitRejection(err)) throw new RpcException('invalid_refresh_token');
      throw err;
    }
    // Firebase doesn't return email on the refresh endpoint; backfill via verifyIdToken
    const verified = await this.adminAuth.verifyIdToken(res.id_token);
    return {
      accessToken: res.id_token,
      refreshToken: res.refresh_token,
      expiresIn: Number(res.expires_in),
      user: { id: res.user_id, email: verified.email ?? '' },
    };
  }

  /**
   * Exchanges the refresh token to derive its uid (Firebase refresh tokens are
   * opaque — there's no way to read the uid without a round-trip), then calls
   * revokeRefreshTokens(uid). This invalidates EVERY session that uid has open,
   * not just this one — Firebase has no narrower primitive. A single logout
   * ends all of a Firebase user's sessions; this is a real SDK limitation, not
   * a design choice.
   */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const res = await this.identityToolkit.refresh(refreshToken);
      const verified = await this.adminAuth.verifyIdToken(res.id_token);
      await this.adminAuth.revokeRefreshTokens(verified.uid);
    } catch {
      // idempotent: revoking an unknown/already-dead token is not an error
    }
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const decoded = await this.adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.adminAuth.setCustomUserClaims(uid, { role });
  }

  async startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    const creds = this.oauth[provider];
    if (!creds) throw new Error(`oauth_provider_not_configured: ${provider}`);
    const state = randomUUID();
    this.pendingStates.set(state, { provider, callbackUrl });
    const base =
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://github.com/login/oauth/authorize';
    const scopes = provider === 'google' ? 'openid email profile' : 'read:user user:email';
    const url = new URL(base);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);
    return { redirectUrl: url.toString(), state };
  }

  async completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    const pending = this.pendingStates.get(state);
    if (!pending || pending.provider !== provider) throw new Error('invalid_oauth_state');
    this.pendingStates.delete(state);
    const creds = this.oauth[provider];
    if (!creds) throw new Error(`oauth_provider_not_configured: ${provider}`);
    if (!this.oauthTokenClient) throw new Error('oauth_token_client_not_configured');
    const tokenRes = await this.oauthTokenClient.exchange(provider, {
      code,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri: pending.callbackUrl,
    });
    const postBody =
      provider === 'google'
        ? `id_token=${tokenRes.idToken}&providerId=google.com`
        : `access_token=${tokenRes.accessToken}&providerId=github.com`;
    const res = await this.identityToolkit.signInWithIdp({
      requestUri: pending.callbackUrl,
      postBody,
    });
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email || tokenRes.email },
    };
  }

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    // Firebase's signInWithEmailLink needs BOTH email + oobCode at verify time.
    // We wire the callback URL so the consumer round-trips the email back as a
    // query param; the gateway then composes `base64(email):oobCode` as the
    // opaque token passed to verifyMagicLink. The continueUrl below carries the
    // email so the link landing page can rebuild the token client-side.
    const wrappedCallback = `${req.callbackUrl}?email=${encodeURIComponent(req.email)}`;
    await this.identityToolkit.sendOobCode({ email: req.email, continueUrl: wrappedCallback });
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const sep = token.indexOf(':');
    if (sep <= 0) throw new Error('invalid_magic_link_token');
    const emailB64 = token.slice(0, sep);
    const oobCode = token.slice(sep + 1);
    if (!emailB64 || !oobCode) throw new Error('invalid_magic_link_token');
    const email = Buffer.from(emailB64, 'base64').toString('utf8');
    const res = await this.identityToolkit.signInWithEmailLink({ email, oobCode });
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async requestPasswordReset(email: string, callbackUrl: string): Promise<void> {
    // The link's continue URL is only used if the user resets on Firebase's own
    // hosted page (default handler): send them to /login, where no code is
    // expected, instead of back to /reset-password without one.
    const continueUrl = new URL('/login', callbackUrl).toString();
    try {
      await this.identityToolkit.sendPasswordResetEmail({ email, continueUrl });
    } catch (err) {
      // Unknown address: succeed silently — no enumeration, no error-log noise.
      if (errorText(err).includes('EMAIL_NOT_FOUND')) return;
      throw err;
    }
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession> {
    let email: string;
    try {
      ({ email } = await this.identityToolkit.confirmPasswordReset({
        oobCode: token,
        newPassword,
      }));
    } catch (err) {
      if (isInvalidOobCode(err)) throw new RpcException('invalid_reset_token');
      if (errorText(err).includes('WEAK_PASSWORD')) throw new RpcException('weak_password');
      throw err;
    }
    // A password change is a "major account change" for Firebase: it already
    // invalidates the user's existing refresh tokens. The explicit uid-wide
    // revoke below is belt-and-braces and therefore best-effort (3 attempts) —
    // failing the whole reset here would strand a user whose password HAS
    // changed and whose one-time code is spent. It must still run BEFORE the new
    // session is minted (revoke is uid-wide; afterwards it would kill that
    // session too — plan ruling 1).
    try {
      const { uid } = await this.adminAuth.getUserByEmail(email);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.adminAuth.revokeRefreshTokens(uid);
          break;
        } catch {
          // retry
        }
      }
    } catch {
      // best-effort (see above)
    }
    return this.signIn(email, newPassword);
  }

  async getRole(uid: string): Promise<string | null> {
    const user = await this.adminAuth.getUser(uid);
    const claims = user.customClaims ?? {};
    const role = claims['role'];
    return typeof role === 'string' ? role : null;
  }
}
