import type { AuthSession, AuthStrategy, MagicLinkRequest, VerifiedToken } from '@icore/shared';
import type { IdentityToolkitClient } from './identity-toolkit.client';

export interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(
    uid: string,
  ): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
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

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    // Firebase's signInWithEmailLink needs BOTH email + oobCode at verify time.
    // We wire the callback URL so the consumer round-trips the email back as a
    // query param; the gateway then composes `base64(email):oobCode` as the
    // opaque token passed to verifyMagicLink. The continueUrl below carries the
    // email so the link landing page can rebuild the token client-side.
    const wrappedCallback = `${req.callbackUrl}?email=${encodeURIComponent(req.email)}`;
    await this.identityToolkit.sendOobCode({ email: req.email, continueUrl: wrappedCallback });
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const sep = token.indexOf(':');
    if (sep <= 0) throw new Error('invalid_magic_link_token');
    const emailB64 = token.slice(0, sep);
    const oobCode = token.slice(sep + 1);
    if (!emailB64 || !oobCode) throw new Error('invalid_magic_link_token');
    const email = Buffer.from(emailB64, 'base64').toString('utf8');
    const res = await this.identityToolkit.signInWithEmailLink({ email, oobCode });
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async getRole(uid: string): Promise<string | null> {
    const user = await this.adminAuth.getUser(uid);
    const claims = user.customClaims ?? {};
    const role = claims['role'];
    return typeof role === 'string' ? role : null;
  }
}
