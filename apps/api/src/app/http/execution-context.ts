import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

// The GraphQL context ({ req, res }) is the third handler argument
// (root, args, context, info). Reading it by index keeps `@nestjs/graphql`
// out of projects that do not use GraphQL.
function graphqlContext(ctx: ExecutionContext): { req: object; res: object } {
  return ctx.getArgByIndex(2);
}

// Optional call: a few hand-built test stubs have no `getType`; they are http.
function isHttp(ctx: ExecutionContext): boolean {
  const type = ctx.getType?.() ?? 'http';
  return type === 'http';
}

export function requestOf<R extends object = Request>(ctx: ExecutionContext): R {
  return (isHttp(ctx) ? ctx.switchToHttp().getRequest() : graphqlContext(ctx).req) as R;
}

export function responseOf<R extends object = Response>(ctx: ExecutionContext): R {
  return (isHttp(ctx) ? ctx.switchToHttp().getResponse() : graphqlContext(ctx).res) as R;
}
