import { randomUUID } from 'node:crypto';
import { RpcException } from '@nestjs/microservices';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '@icore/shared';

export interface SupabaseAuthStrategyOptions {
  client: SupabaseClient;
}

/**
 * supabase-js reports a genuinely rejected refresh token and a transient
 * infrastructure failure through the SAME `error` channel, so `refresh()` has
 * to tell them apart before it can normalize anything to
 * `invalid_refresh_token` — that message makes `AuthGuard` DELETE the session
 * and force a re-login, which must never happen because GoTrue was briefly
 * unreachable.
 *
 * Genuine rejection = a 4xx `AuthApiError` from GoTrue itself (an expired /
 * unknown / already-rotated refresh token is a 400). Everything else —
 * `AuthRetryableFetchError` (network, DNS, 5xx), 408/429 back-pressure, or an
 * error shape we don't recognise — is treated as transient so it propagates
 * as a plain Error and lands on the guard's 503 path with the session intact.
 * Unknown shapes deliberately default to "transient": the cost is a stale
 * record living out its Redis TTL, versus logging a valid user out.
 */
function isGenuineTokenRejection(
  error: {
    name?: string;
    status?: number | null;
  } | null,
): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return false;
  const status = error.status;
  if (typeof status !== 'number') return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

export class SupabaseAuthStrategy implements AuthStrategy {
  private readonly client: SupabaseClient;

  constructor(opts: SupabaseAuthStrategyOptions) {
    this.client = opts.client;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'signup_failed');
    }
    return this.toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_credentials');
    }
    return this.toSession(data.session);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      if (isGenuineTokenRejection(error)) throw new RpcException('invalid_refresh_token');
      // Transient: rethrow as a plain Error so NestJS's RPC filter scrubs it
      // to a generic failure, which AuthGuard maps to 503 WITHOUT deleting
      // the session (see isGenuineTokenRejection above).
      throw new Error(error.message ?? 'supabase_refresh_failed');
    }
    if (!data.session) throw new RpcException('invalid_refresh_token');
    return this.toSession(data.session);
  }

  /**
   * Exchanges the refresh token for its session (rotating it — the token was
   * going to die anyway), then signs the resulting access token out with
   * scope 'local' so ONLY that one session ends, not every session the user
   * has open elsewhere.
   */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data.session) return; // already invalid/expired — idempotent
      await this.client.auth.admin.signOut(data.session.access_token, 'local');
    } catch {
      // idempotent: revoking an unknown/already-dead token is not an error
    }
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) {
      throw new Error(error?.message ?? 'invalid_token');
    }
    const meta = (data.user as { app_metadata?: { role?: string } }).app_metadata;
    return {
      uid: data.user.id,
      email: data.user.email,
      role: meta?.role,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(uid, {
      app_metadata: { role },
    });
    if (error) throw new Error(error.message);
  }

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email: req.email,
      options: { emailRedirectTo: req.callbackUrl },
    });
    if (error) throw new Error(error.message);
  }

  async startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new Error(error?.message ?? 'oauth_start_failed');
    const url = new URL(data.url);
    const state = url.searchParams.get('state') ?? randomUUID();
    return { redirectUrl: data.url, state };
  }

  async completeOAuth(
    _provider: OAuthProvider,
    code: string,
    _state: string,
  ): Promise<AuthSession> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data?.session) throw new Error(error?.message ?? 'oauth_complete_failed');
    return this.toSession(data.session);
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: token,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_magic_link');
    }
    return this.toSession(data.session);
  }

  async getRole(uid: string): Promise<string | null> {
    const { data, error } = await this.client.auth.admin.getUserById(uid);
    if (error || !data.user) throw new Error(error?.message ?? 'user_missing');
    const meta = data.user.app_metadata as { role?: string } | undefined;
    return meta?.role ?? null;
  }

  private toSession(s: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string | null } | null;
  }): AuthSession {
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresIn: s.expires_in,
      user: { id: s.user?.id ?? '', email: s.user?.email ?? '' },
    };
  }
}
