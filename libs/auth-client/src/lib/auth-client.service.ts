import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { AuthSession, OAuthProvider, OAuthStartResult, VerifiedToken } from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.client.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.login', { email, password }));
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.signup', { email, password }));
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.refresh', { refreshToken }));
  }

  setRole(uid: string, role: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('auth.setRole', { uid, role }));
  }

  sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('auth.magicLink.send', { email, callbackUrl }));
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
