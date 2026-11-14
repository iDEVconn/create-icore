import { Field, ObjectType } from '@nestjs/graphql';
import type { VerifiedToken } from '@icore/shared';

@ObjectType('Profile')
export class ProfileModel implements VerifiedToken {
  @Field(() => String)
  uid!: string;

  // The session record always carries an email.
  @Field(() => String)
  email!: string;

  // Optional on the session record and on VerifiedToken.
  @Field(() => String, { nullable: true })
  role?: string;
}
