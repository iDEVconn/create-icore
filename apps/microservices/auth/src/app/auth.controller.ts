import { Controller, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { AuthSession, AuthStrategy, VerifiedToken } from '@icore/shared';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject('AuthStrategy') private readonly strategy: AuthStrategy,
    private readonly cfg: ConfigService,
  ) {}

  @MessagePattern('auth.verify')
  verify(@Payload() payload: { token: string }): Promise<VerifiedToken> {
    return this.strategy.verifyToken(payload.token);
  }

  @MessagePattern('auth.login')
  login(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    return this.strategy.signIn(payload.email, payload.password);
  }

  @MessagePattern('auth.signup')
  async signup(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    const session = await this.strategy.signUp(payload.email, payload.password);
    await this.assignInitialRole(session.user.id, session.user.email);
    return session;
  }

  @MessagePattern('auth.refresh')
  refresh(@Payload() payload: { refreshToken: string }): Promise<AuthSession> {
    return this.strategy.refresh(payload.refreshToken);
  }

  @MessagePattern('auth.setRole')
  setRole(@Payload() payload: { uid: string; role: string }): Promise<void> {
    return this.strategy.setRole(payload.uid, payload.role);
  }

  @MessagePattern('auth.magicLink.send')
  sendMagicLink(@Payload() payload: { email: string; callbackUrl: string }): Promise<void> {
    return this.strategy.sendMagicLink(payload);
  }

  @MessagePattern('auth.magicLink.verify')
  async verifyMagicLink(@Payload() payload: { token: string }): Promise<AuthSession> {
    const session = await this.strategy.verifyMagicLink(payload.token);
    await this.assignInitialRole(session.user.id, session.user.email);
    return session;
  }

  // Idempotent: skips work when a role already exists. Admin emails come
  // from ADMINS_LIST (comma-separated). Everyone else gets 'user'.
  private async assignInitialRole(uid: string, email: string): Promise<void> {
    const existing = await this.strategy.getRole(uid);
    if (existing) {
      this.logger.log(`Role already set for ${uid}: ${existing} — skipping`);
      return;
    }

    const admins = (this.cfg.get<string>('ADMINS_LIST') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const role = admins.includes(email.toLowerCase()) ? 'admin' : 'user';
    await this.strategy.setRole(uid, role);
    this.logger.log(`Assigned role '${role}' to ${uid} (${email})`);
  }
}
