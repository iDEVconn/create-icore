import {
  ArgumentsHost,
  Catch,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GraphQLError } from 'graphql';

/** GraphQL `extensions.code` for an HTTP exception thrown by a guard or a resolver. */
export function graphqlCodeFor(exception: HttpException): string {
  if (exception instanceof UnauthorizedException) return 'UNAUTHENTICATED';
  if (exception instanceof ForbiddenException) return 'FORBIDDEN';
  if (exception instanceof NotFoundException) return 'NOT_FOUND';
  return 'BAD_USER_INPUT';
}

/**
 * Turns an `HttpException` raised inside a GraphQL operation (by `AuthGuard`, `CsrfGuard`,
 * `AbilityGuard` or a resolver) into a `GraphQLError` carrying `extensions.http.status`.
 * Apollo Server uses that as the HTTP status of the response, so a missing session answers
 * HTTP 401 (the client's refresh-on-401 keeps working) instead of 200 with `errors[]`.
 * `ApiGraphqlModule` turns off `@nestjs/apollo`'s plugin that would reset it to 200.
 *
 * Registered globally, so REST exceptions also land here: they are passed to Nest's default
 * handling unchanged.
 */
@Catch(HttpException)
export class GraphqlErrorFilter extends BaseExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): void {
    if (host.getType<string>() !== 'graphql') {
      super.catch(exception, host);
      return;
    }
    throw new GraphQLError(exception.message, {
      extensions: { code: graphqlCodeFor(exception), http: { status: exception.getStatus() } },
    });
  }
}
