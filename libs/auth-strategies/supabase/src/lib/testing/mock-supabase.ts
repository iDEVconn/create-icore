import type { SupabaseClient } from '@supabase/supabase-js';

interface FakeUser {
  id: string;
  email: string;
  password: string;
  role?: string;
}

interface FakeSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
}

export interface MockSupabaseClient {
  client: SupabaseClient;
  getMagicLinkToken(email: string): string;
  getOAuthChallenge(provider: 'google' | 'github', email: string): { code: string; state: string };
}

export function createMockSupabaseClient(): MockSupabaseClient {
  const users = new Map<string, FakeUser>();
  const accessToUid = new Map<string, string>();
  const refreshToUid = new Map<string, string>();
  const magicTokenToUid = new Map<string, string>();
  const magicTokenByEmail = new Map<string, string>();
  const oauthCodeToEmail = new Map<string, string>();
  // Real Supabase sessions carry a stable session identity across refresh-token
  // rotation (the JWT's `session_id` claim doesn't change when the token pair
  // rotates) — admin.signOut('local') revokes that session identity, which
  // invalidates every access token ever issued under it, not just the literal
  // token passed in. Track that lineage here rather than a flat token Set, or
  // revoke() (which rotates via refreshSession before signing out) could only
  // ever invalidate the brand-new post-rotation token, never the caller's
  // original one.
  const accessToSessionId = new Map<string, string>();
  const refreshToSessionId = new Map<string, string>();
  const revokedSessionIds = new Set<string>();
  let sessionCounter = 0;
  let lastOAuthState: string | null = null;

  function issueSession(user: FakeUser, sessionId?: string): FakeSession {
    const sid = sessionId ?? `sid_${user.id}_${sessionCounter++}`;
    const access_token = `at_${user.id}_${accessToUid.size}_${Math.random()}`;
    const refresh_token = `rt_${user.id}_${refreshToUid.size}_${Math.random()}`;
    accessToUid.set(access_token, user.id);
    refreshToUid.set(refresh_token, user.id);
    accessToSessionId.set(access_token, sid);
    refreshToSessionId.set(refresh_token, sid);
    return {
      access_token,
      refresh_token,
      expires_in: 3600,
      user: { id: user.id, email: user.email },
    };
  }

  function findById(uid: string): FakeUser | undefined {
    for (const u of users.values()) if (u.id === uid) return u;
    return undefined;
  }

  const admin = {
    async signOut(jwt: string, _scope?: 'global' | 'local' | 'others') {
      // Revoke the whole session lineage the JWT belongs to (see the
      // accessToSessionId/refreshToSessionId comment above) — matching real
      // Supabase's 'local' scope, which is all this strategy uses.
      const sessionId = accessToSessionId.get(jwt);
      if (sessionId) revokedSessionIds.add(sessionId);
      return { error: null };
    },
    async updateUserById(uid: string, updates: { app_metadata?: { role?: string } }) {
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      if (updates.app_metadata && typeof updates.app_metadata.role === 'string') {
        user.role = updates.app_metadata.role;
      }
      return { data: { user: { id: user.id, email: user.email } }, error: null };
    },
    async getUserById(uid: string) {
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      return {
        data: {
          user: { id: user.id, email: user.email, app_metadata: { role: user.role } },
        },
        error: null,
      };
    },
  };

  const auth = {
    async signUp({ email, password }: { email: string; password: string }) {
      for (const u of users.values()) {
        if (u.email === email) {
          return { data: { user: null, session: null }, error: { message: 'user exists' } };
        }
      }
      const user: FakeUser = { id: `uid_${users.size + 1}`, email, password };
      users.set(user.id, user);
      const session = issueSession(user);
      return { data: { user: session.user, session }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      for (const u of users.values()) {
        if (u.email === email && u.password === password) {
          const session = issueSession(u);
          return { data: { user: session.user, session }, error: null };
        }
      }
      return { data: { user: null, session: null }, error: { message: 'invalid credentials' } };
    },
    async refreshSession({ refresh_token }: { refresh_token: string }) {
      const uid = refreshToUid.get(refresh_token);
      if (!uid)
        return { data: { session: null, user: null }, error: { message: 'invalid refresh' } };
      const sessionId = refreshToSessionId.get(refresh_token);
      refreshToUid.delete(refresh_token); // rotation
      refreshToSessionId.delete(refresh_token);
      const user = findById(uid);
      if (!user) return { data: { session: null, user: null }, error: { message: 'user missing' } };
      // Preserve the session identity across rotation — a refreshed token pair
      // is still the same logical session, not a new one.
      const session = issueSession(user, sessionId);
      return { data: { user: session.user, session }, error: null };
    },
    async signInWithOAuth({
      provider,
      options,
    }: {
      provider: 'google' | 'github';
      options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
    }) {
      const state = `state_${provider}_${Math.random()}`;
      lastOAuthState = state;
      const url = new URL(`https://fake-${provider}.example.com/authorize`);
      url.searchParams.set('redirect_uri', options?.redirectTo ?? '');
      url.searchParams.set('state', state);
      return { data: { url: url.toString(), provider }, error: null };
    },
    async exchangeCodeForSession(code: string) {
      const email = oauthCodeToEmail.get(code);
      if (!email)
        return { data: { session: null, user: null }, error: { message: 'invalid_code' } };
      oauthCodeToEmail.delete(code);
      let user: FakeUser | undefined;
      for (const u of users.values()) if (u.email === email) user = u;
      if (!user) {
        user = { id: `uid_${users.size + 1}`, email, password: '' };
        users.set(user.id, user);
      }
      const session = issueSession(user);
      return { data: { user: session.user, session }, error: null };
    },
    async signInWithOtp({ email }: { email: string; options?: { emailRedirectTo?: string } }) {
      let user: FakeUser | undefined;
      for (const u of users.values()) if (u.email === email) user = u;
      if (!user) {
        user = { id: `uid_${users.size + 1}`, email, password: '' };
        users.set(user.id, user);
      }
      const tokenHash = `otp_${user.id}_${magicTokenToUid.size}_${Math.random()}`;
      magicTokenToUid.set(tokenHash, user.id);
      magicTokenByEmail.set(email, tokenHash);
      return { data: {}, error: null };
    },
    async verifyOtp({ type, token_hash }: { type: 'magiclink'; token_hash: string }) {
      if (type !== 'magiclink') {
        return { data: { user: null, session: null }, error: { message: 'unsupported type' } };
      }
      const uid = magicTokenToUid.get(token_hash);
      if (!uid) return { data: { user: null, session: null }, error: { message: 'invalid otp' } };
      magicTokenToUid.delete(token_hash);
      const user = findById(uid);
      if (!user) return { data: { user: null, session: null }, error: { message: 'user missing' } };
      const session = issueSession(user);
      return { data: { user: session.user, session }, error: null };
    },
    async getUser(token?: string) {
      if (!token) return { data: { user: null }, error: { message: 'missing token' } };
      const tokenSessionId = accessToSessionId.get(token);
      if (tokenSessionId && revokedSessionIds.has(tokenSessionId)) {
        return { data: { user: null }, error: { message: 'session_not_found' } };
      }
      const uid = accessToUid.get(token);
      if (!uid) return { data: { user: null }, error: { message: 'invalid token' } };
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      return {
        data: {
          user: { id: user.id, email: user.email, app_metadata: { role: user.role } },
        },
        error: null,
      };
    },
    admin,
  };

  const client = { auth } as unknown as SupabaseClient;
  return {
    client,
    getMagicLinkToken(email: string): string {
      const token = magicTokenByEmail.get(email);
      if (!token) throw new Error(`no magic-link issued for ${email}`);
      return token;
    },
    getOAuthChallenge(_provider, email) {
      if (!lastOAuthState) throw new Error('no signInWithOAuth called yet');
      const code = `code_${Math.random()}`;
      oauthCodeToEmail.set(code, email);
      return { code, state: lastOAuthState };
    },
  };
}
