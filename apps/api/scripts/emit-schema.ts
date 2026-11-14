// Writes apps/api/schema.gql from the code-first resolvers without booting the gateway.
// Run through `yarn nx run api:graphql-schema`; CI diffs the result against the committed file.
//
// Runs under tsx (esbuild), which does not emit decorator metadata: every @Field / @Query /
// @Mutation / @Args must name its type explicitly (`@Field(() => String)`).
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Query, Resolver } from '@nestjs/graphql';
import { emitSchema } from '../src/app/graphql/schema-emitter';

// Stand-in until the API surfaces (notes, profile, storage resolvers) exist: a schema needs a
// Query type to be valid.
@Resolver()
class PlaceholderResolver {
  @Query(() => Boolean)
  placeholder(): boolean {
    return true;
  }
}

const RESOLVERS = [PlaceholderResolver];

async function main(): Promise<void> {
  const target = join(__dirname, '..', 'schema.gql');
  writeFileSync(target, await emitSchema(RESOLVERS));
  console.log(`GraphQL schema written to ${target}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
