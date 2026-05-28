import { Injectable } from '@nestjs/common';
import { defineAbilitiesFor, type AppAbility, type VerifiedToken } from '@icore/shared';

@Injectable()
export class AbilityFactory {
  forUser(token: VerifiedToken | null | undefined): AppAbility {
    if (!token) return defineAbilitiesFor(null);
    return defineAbilitiesFor({
      id: token.uid,
      role: token.role === 'admin' ? 'admin' : 'user',
    });
  }
}
