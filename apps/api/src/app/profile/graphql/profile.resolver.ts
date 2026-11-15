import { UnauthorizedException } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { VerifiedToken } from '@icore/shared';
import { CurrentUser } from '../../http/current-user.decorator';
import { ProfileGatewayService } from '../profile-gateway.service';
import { ProfileModel } from './profile.model';

@Resolver(() => ProfileModel)
export class ProfileResolver {
  constructor(private readonly profile: ProfileGatewayService) {}

  @Query(() => ProfileModel, { description: 'The authenticated user (uid / email / role / name)' })
  me(@CurrentUser() user: VerifiedToken | undefined): VerifiedToken {
    // The global AuthGuard has already rejected anonymous callers; this keeps a missing user
    // a 401 instead of a null-in-non-null-field error.
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @ResolveField(() => String, { nullable: true })
  name(@Parent() parent: ProfileModel): Promise<string | null> | string | null {
    return parent.name !== undefined ? parent.name : this.profile.nameOf(parent.uid);
  }

  @Mutation(() => ProfileModel, { description: 'Set the display name of the authenticated user' })
  updateProfile(
    @CurrentUser() user: VerifiedToken | undefined,
    @Args('name', { type: () => String }) name: string,
  ): Promise<ProfileModel> {
    return this.profile.update(user, name) as Promise<ProfileModel>;
  }
}
