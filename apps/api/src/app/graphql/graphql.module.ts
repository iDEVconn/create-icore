import { join } from 'node:path';
import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import type { Request, Response } from 'express';
import { GraphqlErrorFilter } from './graphql-error.filter';
import { createLimitRules } from './graphql-limits';
import { GraphqlThrottleMiddleware } from './graphql-throttle.middleware';
import { HealthResolver } from './health.resolver';

/** Where a development server writes the schema (the committed copy comes from `api:graphql-schema`). */
export const SCHEMA_FILE = join(process.cwd(), 'apps/api/schema.gql');

const GRAPHQL_PATH = 'graphql';
const MASKED_MESSAGE = 'Internal server error';

/**
 * Production: errors that are not deliberate (`GraphQLError`, which includes the mapped
 * `HttpException`s and validation errors) lose their message, a mapped 5xx `HttpException` keeps
 * its code but not its message, and no error carries a stack trace.
 */
export function formatGraphqlError(
  formatted: GraphQLFormattedError,
  error: unknown,
  production: boolean,
): GraphQLFormattedError {
  if (!production) return formatted;
  const original = unwrapResolverError(error);
  if (!(original instanceof GraphQLError)) {
    return { message: MASKED_MESSAGE, extensions: { code: 'INTERNAL_SERVER_ERROR' } };
  }
  const extensions = { ...formatted.extensions };
  delete extensions['stacktrace'];
  const status = (original.extensions['http'] as { status?: number } | undefined)?.status;
  const message = status !== undefined && status >= 500 ? MASKED_MESSAGE : formatted.message;
  return { ...formatted, message, extensions };
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
    path: GRAPHQL_PATH,
    // The guards read the request from here (`requestOf` in http/execution-context.ts).
    context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
    introspection: !production,
    graphiql: !production,
    // No "Did you mean …?" field suggestions in validation errors: they leak the schema that
    // introspection hides.
    hideSchemaDetailsFromClientErrors: production,
    allowBatchedHttpRequests: false,
    csrfPrevention: true,
    // Keep the status that GraphqlErrorFilter puts in `extensions.http` (401/403/429/…); by default
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
  providers: [{ provide: APP_FILTER, useClass: GraphqlErrorFilter }, HealthResolver],
})
export class ApiGraphqlModule implements NestModule {
  // Request-level throttle floor, before Apollo parses anything (needs the gateway's global
  // ThrottlerModule). The global prefix applies, so this is /api/graphql.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(GraphqlThrottleMiddleware)
      .forRoutes({ path: GRAPHQL_PATH, method: RequestMethod.ALL });
  }
}
