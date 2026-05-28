import { randomUUID } from 'node:crypto';
import type {
  IdentityToolkitClient,
  IdentityToolkitRefreshResponse,
  IdentityToolkitSignInResponse,
  IdentityToolkitSignUpResponse,
} from '../identity-toolkit.client';

interface FakeUser {
  localId: string;
  email: string;
  password: string;
}

export interface MockHandle {
  client: IdentityToolkitClient;
  users: Map<string, FakeUser>;
  tokensToUid: Map<string, string>;
  refreshToUid: Map<string, string>;
}

export function createMockIdentityToolkit(): MockHandle {
  const users = new Map<string, FakeUser>();
  const tokensToUid = new Map<string, string>();
  const refreshToUid = new Map<string, string>();

  function issue(user: FakeUser) {
    const idToken = `id_${user.localId}_${randomUUID()}`;
    const refreshToken = `rt_${user.localId}_${randomUUID()}`;
    tokensToUid.set(idToken, user.localId);
    refreshToUid.set(refreshToken, user.localId);
    return { idToken, refreshToken, expiresIn: '3600' };
  }

  const client: IdentityToolkitClient = {
    async signUp(email, password) {
      for (const u of users.values()) {
        if (u.email === email) throw new Error('EMAIL_EXISTS');
      }
      const user: FakeUser = { localId: `uid_${users.size + 1}`, email, password };
      users.set(user.localId, user);
      const session = issue(user);
      return { localId: user.localId, email, ...session } as IdentityToolkitSignUpResponse;
    },
    async signIn(email, password) {
      for (const u of users.values()) {
        if (u.email === email && u.password === password) {
          const session = issue(u);
          return {
            localId: u.localId,
            email,
            registered: true,
            ...session,
          } as IdentityToolkitSignInResponse;
        }
      }
      throw new Error('EMAIL_NOT_FOUND_OR_INVALID_PASSWORD');
    },
    async refresh(refreshToken) {
      const uid = refreshToUid.get(refreshToken);
      if (!uid) throw new Error('INVALID_REFRESH_TOKEN');
      refreshToUid.delete(refreshToken); // Firebase rotates
      const user = [...users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      const session = issue(user);
      return {
        id_token: session.idToken,
        refresh_token: session.refreshToken,
        expires_in: session.expiresIn,
        user_id: user.localId,
      } satisfies IdentityToolkitRefreshResponse;
    },
  };

  return { client, users, tokensToUid, refreshToUid };
}
