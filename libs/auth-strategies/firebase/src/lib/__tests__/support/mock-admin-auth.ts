import type { MockHandle } from './mock-identity-toolkit';

interface FakeAdminAuthOptions {
  identityToolkit: MockHandle;
}

export interface FakeAdminAuth {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(
    uid: string,
  ): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
}

export function createMockAdminAuth(opts: FakeAdminAuthOptions): FakeAdminAuth {
  const roles = new Map<string, string>();

  return {
    async verifyIdToken(idToken) {
      const uid = opts.identityToolkit.tokensToUid.get(idToken);
      if (!uid) throw new Error('TOKEN_NOT_FOUND');
      const user = [...opts.identityToolkit.users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      return { uid: user.localId, email: user.email, role: roles.get(uid) };
    },
    async setCustomUserClaims(uid, claims) {
      const role = claims['role'];
      if (typeof role === 'string') roles.set(uid, role);
    },
    async getUser(uid) {
      const user = [...opts.identityToolkit.users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      const role = roles.get(uid);
      return {
        uid: user.localId,
        email: user.email,
        customClaims: role ? { role } : undefined,
      };
    },
  };
}
