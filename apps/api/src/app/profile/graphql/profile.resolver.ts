import { UnauthorizedException } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { VerifiedToken } from '@icore/shared';
import { CurrentUser } from '../../http/current-user.decorator';
import { ProfileModel } from './profile.model';

@Resolver(() => ProfileModel)
export class ProfileResolver {
  @Query(() => ProfileModel, { description: 'The authenticated user (uid / email / role)' })
  me(@CurrentUser() user: VerifiedToken | undefined): VerifiedToken {
    // The global AuthGuard has already rejected anonymous callers; this keeps a missing user
    // a 401 instead of a null-in-non-null-field error.
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
