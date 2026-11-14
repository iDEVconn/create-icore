import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { requestOf } from './execution-context';

/**
 * The user AuthGuard attaches to the request. Structural on purpose: `VerifiedToken` lives in
 * `@icore/shared`'s strategies, which projects without any provider do not ship, and this file
 * ships in every project. `VerifiedToken` is assignable to it.
 */
export interface CurrentUserPayload {
  uid: string;
  email?: string;
  role?: string | null;
}

/** Resolves the authenticated user on both REST and GraphQL handlers. */
export const CurrentUser: () => ParameterDecorator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined =>
    requestOf<{ user?: CurrentUserPayload }>(ctx).user,
);
