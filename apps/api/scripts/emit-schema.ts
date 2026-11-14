// Writes apps/api/schema.gql from the code-first resolvers without booting the gateway.
// Run through `yarn nx run api:graphql-schema`; CI diffs the result against the committed file.
//
// Runs under @swc-node/register with apps/api/tsconfig.app.json (SWC_NODE_PROJECT), which emits
// decorator metadata like the webpack build. tsx/esbuild cannot be used: it emits no metadata,
// and @nestjs/graphql's @Args reads `design:paramtypes` unconditionally (it crashes without it,
// even with an explicit type). Every @Field / @Query / @Args still names its type explicitly.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_SURFACE_RESOLVERS } from '../src/app/graphql/api-surface-resolvers';
import { emitSchema } from '../src/app/graphql/schema-emitter';

async function main(): Promise<void> {
  const target = join(__dirname, '..', 'schema.gql');
  writeFileSync(target, await emitSchema(API_SURFACE_RESOLVERS));
  console.log(`GraphQL schema written to ${target}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
