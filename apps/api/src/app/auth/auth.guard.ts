import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthClientService } from '@icore/auth-client';
import { readSessionId, type SessionRecord, type SessionStore } from '@icore/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_STORE } from '../session/session-store.provider';

const REFRESH_SKEW_MS = 30_000; // refresh 30s before the provider's own expiry

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthClientService) private readonly authClient: AuthClientService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const sessionId = readSessionId(req);
    if (!sessionId) throw new UnauthorizedException('missing_session');

    const current = await this.resolveSession(sessionId);
    if (!current) throw new UnauthorizedException('invalid_session');

    req.user = { uid: current.uid, email: current.email, role: current.role };
    return true;
  }

  /**
   * Loads the session record, refreshing the provider token pair under a
   * distributed lock when it is close to expiry.
   *
   * Everything is wrapped so a SESSION-STORE (Redis) failure becomes the same
   * 503 "auth is temporarily unavailable" answer an auth-MS outage produces,
   * instead of leaking out as a raw 500. The session itself is untouched in
   * that case, so a retry recovers on its own. Decisions already made
   * downstream (`refreshSession`'s 401-vs-503 classification) are
   * `HttpException`s and are re-thrown verbatim, never reclassified here.
   */
  private async resolveSession(sessionId: string): Promise<SessionRecord | null> {
    try {
      const record = await this.sessionStore.get(sessionId);
      if (!record) return null;
      if (!isStale(record)) return record;

      return await this.sessionStore.withRefreshLock(sessionId, async () => {
        // Re-read inside the lock -- another request may have already
        // refreshed while we were waiting for the lock.
        const latest = await this.sessionStore.get(sessionId);
        if (!latest) return null;
        if (!isStale(latest)) return latest;
        return this.refreshSession(sessionId, latest);
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new ServiceUnavailableException('session_store_unavailable');
    }
  }

  private async refreshSession(
    sessionId: string,
    record: SessionRecord,
  ): Promise<SessionRecord | null> {
    let refreshed;
    try {
      refreshed = await this.authClient.refresh(record.providerRefreshToken);
    } catch (err) {
      // Distinguish "the provider is genuinely unreachable" (infra blip --
      // don't punish a user with a perfectly good session) from "the
      // refresh token itself was rejected" (session really is dead). The
      // auth microservice's own transport failures surface as generic
      // Error/TimeoutError from @icore/auth-client, never as a typed
      // "invalid_refresh_token" -- treat anything that isn't an explicit
      // rejection as transient.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('invalid_refresh_token')) {
        await this.sessionStore.delete(sessionId);
        return null;
      }
      throw new ServiceUnavailableException('auth_service_unavailable');
    }

    const updated = {
      providerAccessToken: refreshed.accessToken,
      providerRefreshToken: refreshed.refreshToken,
      providerAccessTokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
      // Re-resolve the role against the provider on every refresh instead of
      // carrying `record.role` forward forever. A role revoked at the
      // provider (admin -> user) would otherwise survive on the session
      // record for its full 30-day life, since nothing else re-reads it once
      // the session exists.
      role: await this.resolveRole(refreshed.accessToken, record.role),
    };
    await this.sessionStore.update(sessionId, updated);
    return { ...record, ...updated };
  }

  /**
   * Best-effort role re-resolution. A verify() blip must not turn an
   * otherwise-successful refresh into a failed request, so it falls back to
   * the role already on the record — no worse than the previous behaviour,
   * which always kept the stale value.
   */
  private async resolveRole(
    accessToken: string,
    fallback: string | undefined,
  ): Promise<string | undefined> {
    try {
      const verified = await this.authClient.verify(accessToken);
      return verified.role;
    } catch {
      return fallback;
    }
  }
}

function isStale(record: SessionRecord): boolean {
  return record.providerAccessTokenExpiresAt - REFRESH_SKEW_MS < Date.now();
}
