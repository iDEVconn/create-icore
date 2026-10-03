import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, type Observable } from 'rxjs';
import { signHmac } from '@icore/shared';
import type {
  AuthSession,
  OAuthProvider,
  OAuthStartResult,
  SignUpConfirmationRequired,
  VerifiedToken,
} from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

const RPC_ERROR_MAP: Record<string, new (message: string) => Error> = {
  user_already_exists: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_refresh_token: UnauthorizedException,
  user_not_found: UnauthorizedException,
  email_not_confirmed: ForbiddenException,
  invalid_reset_token: BadRequestException,
  weak_password: BadRequestException,
};

function rpcMessage(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return undefined;
}

async function mapRpcErrors<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    const message = rpcMessage(err);
    const ExceptionCtor = message ? RPC_ERROR_MAP[message] : undefined;
    if (ExceptionCtor) throw new ExceptionCtor(message as string);
    throw err;
  }
}

/**
 * Upper bound for the RPCs AuthGuard makes while HOLDING the session refresh
 * lock (`refresh` + the role re-check `verify`). The lock is released by TTL
 * (RedisSessionStore LOCK_TTL_MS), so these two calls back to back must finish
 * well inside it: a hung or restarting auth MS then fails fast (the guard
 * answers 503 and keeps the session) instead of letting the lock expire under a
 * live holder and a parallel request refresh with an already-rotated token.
 * Deliberately NOT applied to login/signup/magic-link/reset, which can
 * legitimately be slow (password hashing, outbound email).
 */
export const IN_LOCK_RPC_TIMEOUT_MS = 8_000;

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  /**
   * Signs the payload (plus a timestamp, for replay protection) with an HMAC
   * keyed by AUTH_TCP_SECRET before sending it over TCP, so the microservice
   * can reject requests from a process that reached the port but doesn't know
   * the shared secret, and reject replays of a previously-captured request
   * outside the guard's clock-skew tolerance window. No-op — identical to a
   * plain client.send — when the secret isn't configured, so this is opt-in
   * and doesn't break existing setups.
   */
  private send<T>(pattern: string, payload: object): Observable<T> {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) return this.client.send<T>(pattern, payload);
    const timestamped = { ...payload, _ts: Date.now() };
    const body = { ...timestamped, _sig: signHmac(timestamped, secret) };
    return this.client.send<T>(pattern, body);
  }

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(
      this.send<VerifiedToken>('auth.verify', { token }).pipe(timeout(IN_LOCK_RPC_TIMEOUT_MS)),
    );
  }

  login(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(firstValueFrom(this.send<AuthSession>('auth.login', { email, password })));
  }

  signup(
    email: string,
    password: string,
    callbackUrl?: string,
  ): Promise<AuthSession | SignUpConfirmationRequired> {
    return mapRpcErrors(
      firstValueFrom(
        this.send<AuthSession | SignUpConfirmationRequired>('auth.signup', {
          email,
          password,
          callbackUrl,
        }),
      ),
    );
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(
        this.send<AuthSession>('auth.refresh', { refreshToken }).pipe(
          timeout(IN_LOCK_RPC_TIMEOUT_MS),
        ),
      ),
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.revoke', { refreshToken }));
  }

  async setRole(uid: string, role: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.setRole', { uid, role }));
  }

  async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }));
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return firstValueFrom(this.send<AuthSession>('auth.magicLink.verify', { token }));
  }

  async requestPasswordReset(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.password.forgot', { email, callbackUrl }));
  }

  confirmPasswordReset(token: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.send<AuthSession>('auth.password.reset', { token, password })),
    );
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(this.send<AuthSession>('auth.oauth.complete', { provider, code, state }));
  }
}
