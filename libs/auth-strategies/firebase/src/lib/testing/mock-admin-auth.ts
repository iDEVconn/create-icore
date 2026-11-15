import type { MockHandle } from './mock-identity-toolkit';

interface FakeAdminAuthOptions {
  identityToolkit: MockHandle;
}

export interface FakeAdminAuth {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(uid: string): Promise<{
    uid: string;
    email?: string;
    displayName?: string;
    customClaims?: Record<string, unknown>;
  }>;
  updateUser(uid: string, props: { displayName: string }): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<void>;
  getUserByEmail(email: string): Promise<{ uid: string }>;
}

export function createMockAdminAuth(opts: FakeAdminAuthOptions): FakeAdminAuth {
  const roles = new Map<string, string>();
  const displayNames = new Map<string, string>();

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
        displayName: displayNames.get(uid),
        customClaims: role ? { role } : undefined,
      };
    },
    async updateUser(uid, props) {
      if (![...opts.identityToolkit.users.values()].some((u) => u.localId === uid)) {
        throw new Error('USER_NOT_FOUND');
      }
      displayNames.set(uid, props.displayName);
      return undefined;
    },
    async revokeRefreshTokens(uid) {
      opts.identityToolkit.revokeUser(uid);
    },
    async getUserByEmail(email) {
      const user = [...opts.identityToolkit.users.values()].find((u) => u.email === email);
      if (!user) throw new Error('USER_NOT_FOUND');
      return { uid: user.localId };
    },
  };
}
