export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  role?: string;
}

export interface MagicLinkRequest {
  email: string;
  callbackUrl: string;
}

export type OAuthProvider = 'google' | 'github';

export interface OAuthStartResult {
  redirectUrl: string;
  state: string;
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  /**
   * Invalidates a refresh token (logout) — a further refresh() call with it
   * must fail. Idempotent: revoking an already-invalid/unknown token is not
   * an error. Access tokens are short-lived JWTs verified statelessly, so an
   * already-issued access token keeps working until its own expiry; this
   * only prevents minting new ones from the revoked refresh token.
   */
  revoke(refreshToken: string): Promise<void>;
  setRole(uid: string, role: string): Promise<void>;
  getRole(uid: string): Promise<string | null>;
  sendMagicLink(req: MagicLinkRequest): Promise<void>;
  verifyMagicLink(token: string): Promise<AuthSession>;
  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult>;
  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession>;
}
