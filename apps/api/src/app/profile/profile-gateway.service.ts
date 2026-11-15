import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthClientService } from '@icore/auth-client';
import type { VerifiedToken } from '@icore/shared';
import { parseProfileName } from './profile-name';

export interface ProfileView {
  uid: string;
  email?: string;
  role?: string;
  name: string | null;
}

/**
 * Profile rules shared by the REST controller and the GraphQL resolver. The uid always comes from
 * the session the AuthGuard resolved, never from the request: a user can only touch their own profile.
 */
@Injectable()
export class ProfileGatewayService {
  constructor(private readonly auth: AuthClientService) {}

  async get(user: VerifiedToken | undefined): Promise<ProfileView> {
    const u = requireUser(user);
    const { name } = await this.auth.getProfile(u.uid);
    return { uid: u.uid, email: u.email, role: u.role, name };
  }

  /** Display name of `uid`, for the GraphQL `name` field (resolved only when selected). */
  async nameOf(uid: string): Promise<string | null> {
    return (await this.auth.getProfile(uid)).name;
  }

  async update(user: VerifiedToken | undefined, rawName: unknown): Promise<ProfileView> {
    const u = requireUser(user);
    const name = parseProfileName(rawName);
    const saved = await this.auth.updateProfile(u.uid, name);
    return { uid: u.uid, email: u.email, role: u.role, name: saved.name };
  }
}

function requireUser(user: VerifiedToken | undefined): VerifiedToken {
  // The global AuthGuard has already rejected anonymous callers; this keeps a missing user a 401.
  if (!user) throw new UnauthorizedException();
  return user;
}
