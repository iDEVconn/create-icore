import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { Public } from '../../../../apps/api/src/app/auth/public.decorator';

@Injectable()
export class CanaryDep {
  readonly name = 'canary-dep';
}

@Injectable()
export class CanaryService {
  // Deliberately NO @Inject: relies on emitDecoratorMetadata (design:paramtypes).
  // A build that drops decorator metadata injects `undefined` here, silently.
  constructor(private readonly dep: CanaryDep) {}

  implicitInjection(): boolean {
    return this.dep !== undefined && this.dep.name === 'canary-dep';
  }
}

@Public()
@Controller('g0')
export class G0Controller {
  // The controller itself uses an explicit token so the canary route can still answer
  // when implicit injection is broken (otherwise the whole route would 500).
  constructor(@Inject(CanaryService) private readonly canary: CanaryService) {}

  @Get('health')
  health() {
    return {
      ok: true,
      runtime: typeof (globalThis as any).WebSocketPair !== 'undefined' ? 'workerd' : 'other',
    };
  }

  @Get('canary')
  check() {
    return { implicitInjection: this.canary.implicitInjection() };
  }
}
