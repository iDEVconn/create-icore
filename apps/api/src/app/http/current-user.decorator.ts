import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { VerifiedToken } from '@icore/shared';
import { requestOf } from './execution-context';

/** Resolves the authenticated user on both REST and GraphQL handlers. */
export const CurrentUser: () => ParameterDecorator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): VerifiedToken | undefined =>
    requestOf<{ user?: VerifiedToken }>(ctx).user,
);
