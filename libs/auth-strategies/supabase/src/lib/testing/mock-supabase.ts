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
}

export function createMockSupabaseClient(): MockSupabaseClient {
  const users = new Map<string, FakeUser>();
  const accessToUid = new Map<string, string>();
  const refreshToUid = new Map<string, string>();
  const magicTokenToUid = new Map<string, string>();
  const magicTokenByEmail = new Map<string, string>();

  function issueSession(user: FakeUser): FakeSession {
    const access_token = `at_${user.id}_${accessToUid.size}_${Math.random()}`;
    const refresh_token = `rt_${user.id}_${refreshToUid.size}_${Math.random()}`;
    accessToUid.set(access_token, user.id);
    refreshToUid.set(refresh_token, user.id);
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
      refreshToUid.delete(refresh_token); // rotation
      const user = findById(uid);
      if (!user) return { data: { session: null, user: null }, error: { message: 'user missing' } };
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
    admin: {
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
    },
  };

  const client = { auth } as unknown as SupabaseClient;
  return {
    client,
    getMagicLinkToken(email: string): string {
      const token = magicTokenByEmail.get(email);
      if (!token) throw new Error(`no magic-link issued for ${email}`);
      return token;
    },
  };
}
