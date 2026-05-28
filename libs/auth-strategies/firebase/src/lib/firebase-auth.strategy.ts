import type { AuthSession, AuthStrategy, VerifiedToken } from '@icore/shared';
import type { IdentityToolkitClient } from './identity-toolkit.client';

export interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}

export interface FirebaseAuthStrategyOptions {
  identityToolkit: IdentityToolkitClient;
  adminAuth: FirebaseAdminAuthLike;
}

export class FirebaseAuthStrategy implements AuthStrategy {
  private readonly identityToolkit: IdentityToolkitClient;
  private readonly adminAuth: FirebaseAdminAuthLike;

  constructor(opts: FirebaseAuthStrategyOptions) {
    this.identityToolkit = opts.identityToolkit;
    this.adminAuth = opts.adminAuth;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signUp(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signIn(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const res = await this.identityToolkit.refresh(refreshToken);
    // Firebase doesn't return email on the refresh endpoint; backfill via verifyIdToken
    const verified = await this.adminAuth.verifyIdToken(res.id_token);
    return {
      accessToken: res.id_token,
      refreshToken: res.refresh_token,
      expiresIn: Number(res.expires_in),
      user: { id: res.user_id, email: verified.email ?? '' },
    };
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const decoded = await this.adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.adminAuth.setCustomUserClaims(uid, { role });
  }
}
