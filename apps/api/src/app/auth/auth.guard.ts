import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthClientService } from '@icore/auth-client';
import { readSessionId, type SessionStore } from '@icore/shared';
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

    const record = await this.sessionStore.get(sessionId);
    if (!record) throw new UnauthorizedException('invalid_session');

    const isStale = record.providerAccessTokenExpiresAt - REFRESH_SKEW_MS < Date.now();
    const current = isStale
      ? await this.sessionStore.withRefreshLock(sessionId, async () => {
          // Re-read inside the lock -- another request may have already
          // refreshed while we were waiting for the lock.
          const latest = await this.sessionStore.get(sessionId);
          if (!latest) return null;
          if (latest.providerAccessTokenExpiresAt - REFRESH_SKEW_MS >= Date.now()) return latest;
          return this.refreshSession(sessionId, latest);
        })
      : record;

    if (!current) throw new UnauthorizedException('invalid_session');

    req.user = { uid: current.uid, email: current.email, role: current.role };
    return true;
  }

  private async refreshSession(
    sessionId: string,
    record: NonNullable<Awaited<ReturnType<SessionStore['get']>>>,
  ) {
    try {
      const refreshed = await this.authClient.refresh(record.providerRefreshToken);
      const updated = {
        providerAccessToken: refreshed.accessToken,
        providerRefreshToken: refreshed.refreshToken,
        providerAccessTokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
        role: record.role,
      };
      await this.sessionStore.update(sessionId, updated);
      return { ...record, ...updated };
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
  }
}
