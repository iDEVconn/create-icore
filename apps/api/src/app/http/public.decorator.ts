import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exempts a route from the global `AuthGuard`. Lives in `http/` (not `auth/`) because `http/`
 * ships in `auth=none` projects while `auth/` is removed there; `auth/public.decorator.ts`
 * re-exports it so existing imports keep working.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
