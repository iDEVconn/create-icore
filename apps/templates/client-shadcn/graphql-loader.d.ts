// `vite-plugin-graphql-loader` turns every `*.graphql` import into a parsed
// `DocumentNode` (all operations and fragments of the file). Pick one
// operation out of it with `operation()` from `src/graphql/operation.ts`.
declare module '*.graphql' {
  import type { DocumentNode } from 'graphql';
  const document: DocumentNode;
  export default document;
}
