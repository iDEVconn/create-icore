import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { requestOf, responseOf } from './execution-context';

/** ThrottlerGuard that also works for non-http (GraphQL) execution contexts. */
@Injectable()
export class ContextAwareThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(ctx: ExecutionContext): {
    req: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    res: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  } {
    return { req: requestOf(ctx), res: responseOf(ctx) };
  }
}
