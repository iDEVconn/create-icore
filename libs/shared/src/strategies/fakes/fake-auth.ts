import { randomUUID } from 'node:crypto';
import type { AuthSession, AuthStrategy, VerifiedToken } from '../auth';

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

  async signUp(email: string, password: string): Promise<AuthSession> {
    if (this.users.has(email)) throw new Error('user_exists');
    const user: StoredUser = { id: randomUUID(), email, password };
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

  private findById(uid: string): StoredUser {
    for (const user of this.users.values()) {
      if (user.id === uid) return user;
    }
    throw new Error('user_missing');
  }

  private issueSession(user: StoredUser): AuthSession {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
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
