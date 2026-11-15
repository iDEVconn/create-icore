import { NestFactory } from '@nestjs/core';
import {
  GRAPHQL_SDL_FILE_END,
  GRAPHQL_SDL_FILE_HEADER,
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { lexicographicSortSchema, printSchema } from 'graphql';

/**
 * Prints the code-first schema of `resolvers` without booting the gateway (no HTTP server, no
 * guards, no microservice clients). The output matches what `ApiGraphqlModule` writes in
 * development (same header, sorted, trailing newline), so the two never fight over schema.gql.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export async function emitSchema(resolvers: Function[]): Promise<string> {
  const app = await NestFactory.createApplicationContext(GraphQLSchemaBuilderModule, {
    logger: false,
  });
  try {
    const factory = app.get(GraphQLSchemaFactory);
    const schema = await factory.create(resolvers);
    return (
      GRAPHQL_SDL_FILE_HEADER + printSchema(lexicographicSortSchema(schema)) + GRAPHQL_SDL_FILE_END
    );
  } finally {
    await app.close();
  }
}
