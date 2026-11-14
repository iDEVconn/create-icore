import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { Note } from '@icore/shared';

// Every type is named explicitly (`() => String`): the schema stays independent of decorator
// metadata inference. `api:graphql-schema` runs under @swc-node/register with metadata on, but
// explicit types keep the printed schema stable if that ever changes.

@ObjectType('Note')
export class NoteModel implements Note {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  ownerId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  body!: string;

  @Field(() => String)
  createdAt!: string;

  @Field(() => String)
  updatedAt!: string;
}

@ObjectType('NotePage')
export class NotePage {
  @Field(() => [NoteModel])
  items!: NoteModel[];

  @Field(() => Int)
  total!: number;
}
