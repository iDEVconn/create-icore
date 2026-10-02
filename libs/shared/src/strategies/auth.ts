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

export interface SignUpOptions {
  /** Where the provider's confirmation email should send the user back to. */
  callbackUrl?: string;
}

/** Returned by the auth MS `auth.signup` when the user exists but has no session yet. */
export interface SignUpConfirmationRequired {
  status: 'confirmation_required';
  user: { id: string; email: string };
}

/**
 * Thrown by `AuthStrategy.signUp` when the account was created but the provider
 * requires the user to confirm their email before a session can be issued
 * (e.g. Supabase "Confirm email"). Not a failure — the auth MS turns it into
 * `SignUpConfirmationRequired`.
 */
export class EmailConfirmationRequiredError extends Error {
  /**
   * `existingAccount`: the provider answered a duplicate signup with an
   * obfuscated user (anti account-enumeration) — `user.id` is a throw-away id,
   * NOT a real account, so callers must not look it up or assign it a role.
   */
  constructor(
    readonly user: { id: string; email: string },
    readonly existingAccount = false,
  ) {
    super('email_confirmation_required');
    this.name = 'EmailConfirmationRequiredError';
  }
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  /** May throw `EmailConfirmationRequiredError` instead of returning a session. */
  signUp(email: string, password: string, opts?: SignUpOptions): Promise<AuthSession>;
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
