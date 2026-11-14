import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import type { Request, Response } from 'express';
import { GraphqlErrorFilter } from './graphql-error.filter';
import { createLimitRules } from './graphql-limits';

/** Where a development server writes the schema (the committed copy comes from `api:graphql-schema`). */
export const SCHEMA_FILE = join(process.cwd(), 'apps/api/schema.gql');

/**
 * Production: errors that are not deliberate (`GraphQLError`, which includes the mapped
 * `HttpException`s and validation errors) lose their message, and no error carries a stack trace.
 */
export function formatGraphqlError(
  formatted: GraphQLFormattedError,
  error: unknown,
  production: boolean,
): GraphQLFormattedError {
  if (!production) return formatted;
  if (!(unwrapResolverError(error) instanceof GraphQLError)) {
    return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
  }
  const extensions = { ...formatted.extensions };
  delete extensions['stacktrace'];
  return { ...formatted, extensions };
}

/** Read when the module is compiled (not when this file is imported), so NODE_ENV can be set first. */
export function graphqlOptions(env: NodeJS.ProcessEnv = process.env): ApolloDriverConfig {
  const production = env['NODE_ENV'] === 'production';
  // Test runs keep the schema in memory instead of overwriting the committed file.
  const writeSchemaFile = !production && env['NODE_ENV'] !== 'test';
  return {
    autoSchemaFile: writeSchemaFile ? SCHEMA_FILE : true,
    sortSchema: true,
    buildSchemaOptions: { addNewlineAtEnd: true },
    useGlobalPrefix: true,
    path: 'graphql',
    // The guards read the request from here (`requestOf` in http/execution-context.ts).
    context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
    introspection: !production,
    graphiql: !production,
    allowBatchedHttpRequests: false,
    csrfPrevention: true,
    // Keep the status that GraphqlErrorFilter puts in `extensions.http` (401/403/404); by default
    // @nestjs/apollo resets every response that has a `data` key to HTTP 200.
    preserveHttpStatusForExecutionErrors: false,
    validationRules: createLimitRules({ maxDepth: 8, maxAliases: 15 }),
    formatError: (formatted, error) => formatGraphqlError(formatted, error, production),
  };
}

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: () => graphqlOptions(),
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: GraphqlErrorFilter }],
})
export class ApiGraphqlModule {}
