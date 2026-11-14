import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { Note } from '@icore/shared';

// Every type is named explicitly: `api:graphql-schema` runs under tsx, which emits no
// decorator metadata to infer from.

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
