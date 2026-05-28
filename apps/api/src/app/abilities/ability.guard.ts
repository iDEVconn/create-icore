import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { VerifiedToken } from '@icore/shared';
import { AbilityFactory } from './ability.factory';
import { CHECK_ABILITY_KEY, type RequiredRule } from './check-ability.decorator';

@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly factory: AbilityFactory,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredRule | undefined>(CHECK_ABILITY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: VerifiedToken }>();
    const ability = this.factory.forUser(req.user);
    if (!ability.can(required.action, required.subject)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
