import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthSession, AuthStrategy, VerifiedToken } from '@icore/shared';

export interface SupabaseAuthStrategyOptions {
  client: SupabaseClient;
}

export class SupabaseAuthStrategy implements AuthStrategy {
  private readonly client: SupabaseClient;

  constructor(opts: SupabaseAuthStrategyOptions) {
    this.client = opts.client;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'signup_failed');
    }
    return this.toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_credentials');
    }
    return this.toSession(data.session);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_refresh_token');
    }
    return this.toSession(data.session);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) {
      throw new Error(error?.message ?? 'invalid_token');
    }
    const meta = (data.user as { app_metadata?: { role?: string } }).app_metadata;
    return {
      uid: data.user.id,
      email: data.user.email,
      role: meta?.role,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(uid, {
      app_metadata: { role },
    });
    if (error) throw new Error(error.message);
  }

  private toSession(s: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string | null } | null;
  }): AuthSession {
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresIn: s.expires_in,
      user: { id: s.user?.id ?? '', email: s.user?.email ?? '' },
    };
  }
}
