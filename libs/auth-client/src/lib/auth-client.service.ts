import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
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

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.client.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.login', { email, password })),
    );
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.signup', { email, password })),
    );
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.client.send<AuthSession>('auth.refresh', { refreshToken })),
    );
  }

  async setRole(uid: string, role: string): Promise<void> {
    await firstValueFrom(this.client.send<{ ok: true }>('auth.setRole', { uid, role }));
  }

  async sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(
      this.client.send<{ ok: true }>('auth.magicLink.send', { email, callbackUrl }),
    );
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.magicLink.verify', { token }));
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.client.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(
      this.client.send<AuthSession>('auth.oauth.complete', { provider, code, state }),
    );
  }
}
