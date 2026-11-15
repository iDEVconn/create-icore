import { Field, ObjectType } from '@nestjs/graphql';
import type { StorageRef } from '@icore/shared';

@ObjectType('StorageRef')
export class StorageRefModel implements StorageRef {
  @Field(() => String)
  bucket!: string;

  @Field(() => String)
  path!: string;
}
