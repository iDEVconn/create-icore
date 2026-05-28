import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { AuthSession, AuthStrategy, VerifiedToken } from '@icore/shared';

@Controller()
export class AuthController {
  constructor(@Inject('AuthStrategy') private readonly strategy: AuthStrategy) {}

  @MessagePattern('auth.verify')
  verify(@Payload() payload: { token: string }): Promise<VerifiedToken> {
    return this.strategy.verifyToken(payload.token);
  }

  @MessagePattern('auth.login')
  login(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    return this.strategy.signIn(payload.email, payload.password);
  }

  @MessagePattern('auth.signup')
  signup(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    return this.strategy.signUp(payload.email, payload.password);
  }

  @MessagePattern('auth.refresh')
  refresh(@Payload() payload: { refreshToken: string }): Promise<AuthSession> {
    return this.strategy.refresh(payload.refreshToken);
  }

  @MessagePattern('auth.setRole')
  setRole(@Payload() payload: { uid: string; role: string }): Promise<void> {
    return this.strategy.setRole(payload.uid, payload.role);
  }
}
