import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  VerifiedToken,
} from '../auth';

interface PendingOAuth {
  provider: OAuthProvider;
  email: string;
}

interface StoredUser {
  id: string;
  email: string;
  password: string;
  role?: string;
}

export class FakeAuthStrategy implements AuthStrategy {
  private readonly users = new Map<string, StoredUser>();
  private readonly tokensToUid = new Map<string, string>();
  private readonly refreshToUid = new Map<string, string>();
  private readonly magicLinkTokens = new Map<string, string>();
  private readonly magicLinkByEmail = new Map<string, string>();
  // OAuth state → pending challenge ; code → state ; cursor for the contract helper
  private readonly oauthStates = new Map<string, PendingOAuth>();
  private readonly oauthCodes = new Map<string, string>();
  private lastOAuthState: string | null = null;

  async signUp(email: string, password: string): Promise<AuthSession> {
    if (this.users.has(email)) throw new Error('user_exists');
    const user: StoredUser = { id: globalThis.crypto.randomUUID(), email, password };
    this.users.set(email, user);
    return this.issueSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.get(email);
    if (!user || user.password !== password) throw new Error('invalid_credentials');
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const uid = this.refreshToUid.get(refreshToken);
    if (!uid) throw new Error('invalid_refresh_token');
    this.refreshToUid.delete(refreshToken);
    const user = this.findById(uid);
    return this.issueSession(user);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const uid = this.tokensToUid.get(token);
    if (!uid) throw new Error('invalid_token');
    const user = this.findById(uid);
    return { uid: user.id, email: user.email, role: user.role };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const user = this.findById(uid);
    user.role = role;
  }

  async getRole(uid: string): Promise<string | null> {
    const user = this.findById(uid);
    return user.role ?? null;
  }

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    let user = this.users.get(req.email);
    if (!user) {
      user = { id: globalThis.crypto.randomUUID(), email: req.email, password: '' };
      this.users.set(req.email, user);
    }
    const token = globalThis.crypto.randomUUID();
    this.magicLinkTokens.set(token, user.id);
    this.magicLinkByEmail.set(req.email, token);
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const uid = this.magicLinkTokens.get(token);
    if (!uid) throw new Error('invalid_magic_link');
    this.magicLinkTokens.delete(token);
    const user = this.findById(uid);
    return this.issueSession(user);
  }

  getLastMagicLinkToken(email: string): string {
    const token = this.magicLinkByEmail.get(email);
    if (!token) throw new Error(`no magic-link issued for ${email}`);
    return token;
  }

  async startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    const state = globalThis.crypto.randomUUID();
    this.lastOAuthState = state;
    const url = new URL(`https://fake-${provider}.example.com/authorize`);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    return { redirectUrl: url.toString(), state };
  }

  async completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    const pending = this.oauthStates.get(state);
    if (!pending || pending.provider !== provider) throw new Error('invalid_oauth_state');
    if (this.oauthCodes.get(code) !== state) throw new Error('invalid_oauth_code');
    this.oauthStates.delete(state);
    this.oauthCodes.delete(code);
    let user = this.users.get(pending.email);
    if (!user) {
      user = { id: globalThis.crypto.randomUUID(), email: pending.email, password: '' };
      this.users.set(pending.email, user);
    }
    return this.issueSession(user);
  }

  // Test helper. Reserves a code + state pair for the contract harness so it
  // can drive completeOAuth without an actual provider redirect. The state
  // comes from the most recent startOAuth call.
  getLastOAuthChallenge(provider: OAuthProvider, email: string): { code: string; state: string } {
    if (!this.lastOAuthState) throw new Error('no startOAuth called yet');
    const state = this.lastOAuthState;
    const code = globalThis.crypto.randomUUID();
    this.oauthStates.set(state, { provider, email });
    this.oauthCodes.set(code, state);
    return { code, state };
  }

  private findById(uid: string): StoredUser {
    for (const user of this.users.values()) {
      if (user.id === uid) return user;
    }
    throw new Error('user_missing');
  }

  private issueSession(user: StoredUser): AuthSession {
    const accessToken = globalThis.crypto.randomUUID();
    const refreshToken = globalThis.crypto.randomUUID();
    this.tokensToUid.set(accessToken, user.id);
    this.refreshToUid.set(refreshToken, user.id);
    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: { id: user.id, email: user.email },
    };
  }
}
