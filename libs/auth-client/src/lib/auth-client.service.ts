import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { signHmac } from '@icore/shared';
import type { AuthSession, OAuthProvider, OAuthStartResult, VerifiedToken } from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

const RPC_ERROR_MAP: Record<string, new (message: string) => Error> = {
  user_already_exists: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_refresh_token: UnauthorizedException,
  user_not_found: UnauthorizedException,
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

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  /**
   * Signs the payload with an HMAC (keyed by AUTH_TCP_SECRET) before sending it
   * over TCP, so the microservice can reject requests from a process that
   * reached the port but doesn't know the shared secret. No-op — identical to
   * a plain client.send — when the secret isn't configured, so this is opt-in
   * and doesn't break existing setups.
   */
  private send<T>(pattern: string, payload: object): Observable<T> {
    const secret = process.env['AUTH_TCP_SECRET'];
    const body = secret ? { ...payload, _sig: signHmac(payload, secret) } : payload;
    return this.client.send<T>(pattern, body);
  }

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(firstValueFrom(this.send<AuthSession>('auth.login', { email, password })));
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(firstValueFrom(this.send<AuthSession>('auth.signup', { email, password })));
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return mapRpcErrors(firstValueFrom(this.send<AuthSession>('auth.refresh', { refreshToken })));
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

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(this.send<AuthSession>('auth.oauth.complete', { provider, code, state }));
  }
}
