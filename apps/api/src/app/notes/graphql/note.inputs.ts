import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateNoteInput {
  @Field(() => String)
  title!: string;

  @Field(() => String)
  body!: string;
}

@InputType()
export class UpdateNoteInput {
  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => String, { nullable: true })
  body?: string;
}
