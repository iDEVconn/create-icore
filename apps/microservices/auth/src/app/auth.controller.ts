import { Controller, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EmailConfirmationRequiredError } from '@icore/shared';
import type {
  AuthSession,
  AuthStrategy,
  OAuthProvider,
  OAuthStartResult,
  SignUpConfirmationRequired,
  VerifiedToken,
} from '@icore/shared';

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
  async signup(
    @Payload() payload: { email: string; password: string; callbackUrl?: string },
  ): Promise<AuthSession | SignUpConfirmationRequired> {
    let session: AuthSession;
    try {
      session = await this.strategy.signUp(payload.email, payload.password, {
        callbackUrl: payload.callbackUrl,
      });
    } catch (err) {
      if (err instanceof EmailConfirmationRequiredError) {
        // Account exists, no session until the user confirms. The role is
        // assigned now so the first post-confirmation login already has it —
        // except for an already-registered email, where the provider hands
        // back an obfuscated user: its id is not a real account (and the real
        // account got its role at its own signup), so touching it would 500
        // and turn this endpoint into an account-existence oracle.
        if (!err.existingAccount) await this.assignInitialRole(err.user.id, err.user.email);
        return { status: 'confirmation_required', user: err.user };
      }
      throw err;
    }
    await this.assignInitialRole(session.user.id, session.user.email);
    // Re-mint via refresh(): JWT-based strategies bake `role` into the token at
    // sign time, so the pre-assignment session's token would otherwise report
    // no role until the client's next login or refresh.
    return this.strategy.refresh(session.refreshToken);
  }

  @MessagePattern('auth.refresh')
  refresh(@Payload() payload: { refreshToken: string }): Promise<AuthSession> {
    return this.strategy.refresh(payload.refreshToken);
  }

  @MessagePattern('auth.setRole')
  async setRole(@Payload() payload: { uid: string; role: string }): Promise<{ ok: true }> {
    await this.strategy.setRole(payload.uid, payload.role);
    return { ok: true };
  }

  @MessagePattern('auth.revoke')
  async revoke(@Payload() payload: { refreshToken: string }): Promise<{ ok: true }> {
    await this.strategy.revoke(payload.refreshToken);
    return { ok: true };
  }

  @MessagePattern('auth.magicLink.send')
  async sendMagicLink(
    @Payload() payload: { email: string; callbackUrl: string },
  ): Promise<{ ok: true }> {
    await this.strategy.sendMagicLink(payload);
    return { ok: true };
  }

  @MessagePattern('auth.magicLink.verify')
  async verifyMagicLink(@Payload() payload: { token: string }): Promise<AuthSession> {
    const session = await this.strategy.verifyMagicLink(payload.token);
    await this.assignInitialRole(session.user.id, session.user.email);
    return this.strategy.refresh(session.refreshToken);
  }

  @MessagePattern('auth.oauth.start')
  startOAuth(
    @Payload() payload: { provider: OAuthProvider; callbackUrl: string },
  ): Promise<OAuthStartResult> {
    return this.strategy.startOAuth(payload.provider, payload.callbackUrl);
  }

  @MessagePattern('auth.oauth.complete')
  async completeOAuth(
    @Payload() payload: { provider: OAuthProvider; code: string; state: string },
  ): Promise<AuthSession> {
    const session = await this.strategy.completeOAuth(
      payload.provider,
      payload.code,
      payload.state,
    );
    await this.assignInitialRole(session.user.id, session.user.email);
    return this.strategy.refresh(session.refreshToken);
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
