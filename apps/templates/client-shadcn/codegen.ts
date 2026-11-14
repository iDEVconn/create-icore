import path from 'node:path';
import type { CodegenConfig } from '@graphql-codegen/cli';

// Validates every operation in src/graphql/gql/*.graphql against the
// gateway's committed schema and writes their result/variables types to
// src/gql/types.ts (committed). Run: `nx run <client>:graphql-codegen`.
//
// Paths are resolved from this file, not from the cwd. The schema lives at the
// workspace root's apps/api/schema.gql: three levels up from
// apps/templates/client-<ui>/ in the iCore repo, two levels up from
// apps/client/ in a generated project (create-icore rewrites the segment).
const config: CodegenConfig = {
  overwrite: true,
  schema: path.resolve(import.meta.dirname, '../../../apps/api/schema.gql'),
  documents: [path.resolve(import.meta.dirname, 'src/graphql/gql/*.graphql')],
  // A generated project without auth ships no operation (its schema is the public `health`
  // query only); codegen must still succeed there.
  ignoreNoDocuments: true,
  generates: {
    [path.resolve(import.meta.dirname, 'src/gql/types.ts')]: {
      // typescript-operations 7 is standalone: it emits the operation
      // result/variables types plus only the input/enum types they use.
      plugins: ['typescript-operations'],
    },
  },
};

export default config;
