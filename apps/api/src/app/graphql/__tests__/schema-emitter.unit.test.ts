import { Args, Field, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { describe, expect, it } from 'vitest';
import { emitSchema } from '../schema-emitter';

@ObjectType()
class Thing {
  @Field(() => String)
  name!: string;

  @Field(() => Int)
  count!: number;
}

@Resolver()
class ThingsResolver {
  @Query(() => Thing)
  thing(): Thing {
    return { name: 'x', count: 1 };
  }

  @Query(() => String)
  alpha(): string {
    return 'a';
  }

  @Mutation(() => Boolean)
  bump(@Args('by', { type: () => Int }) _by: number): boolean {
    return true;
  }
}

describe('emitSchema', () => {
  it('prints the SDL of the given resolvers without booting an app, sorted', async () => {
    const sdl = await emitSchema([ThingsResolver]);
    expect(sdl).toContain('type Thing {\n  count: Int!\n  name: String!\n}');
    expect(sdl).toContain('type Query {\n  alpha: String!\n  thing: Thing!\n}');
    expect(sdl).toContain('type Mutation {\n  bump(by: Int!): Boolean!\n}');
    expect(sdl.endsWith('\n')).toBe(true);
  });

  it('is deterministic', async () => {
    expect(await emitSchema([ThingsResolver])).toBe(await emitSchema([ThingsResolver]));
  });
});
