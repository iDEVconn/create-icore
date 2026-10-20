import type { DurableObjectStorageLike } from './durable-object-types';

export interface ThrottleRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface ThrottleState {
  /** Expiry time of every counted hit; a hit stops counting once it expires. */
  hits: number[];
  blockedUntil: number;
}

const STATE_KEY = 'state';

/**
 * The counter of ONE throttle key, run inside one Durable Object (keyed by
 * `<throttler>:<key>`), so limits hold across Worker isolates. Mirrors the
 * counting rules of `@nestjs/throttler`'s in-memory `ThrottlerStorageService`.
 */
export class ThrottleObjectCore {
  constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(ttl: number, limit: number, blockDuration: number): Promise<ThrottleRecord> {
    const now = this.now();
    const state = (await this.storage.get<ThrottleState>(STATE_KEY)) ?? {
      hits: [],
      blockedUntil: 0,
    };
    if (state.blockedUntil > 0 && state.blockedUntil <= now) {
      state.hits = [];
      state.blockedUntil = 0;
    }
    state.hits = state.hits.filter((expiresAt) => expiresAt > now);
    const seconds = (ms: number) => Math.ceil((ms - now) / 1000);

    let isBlocked = state.blockedUntil > now;
    if (!isBlocked) {
      if (blockDuration <= 0) {
        isBlocked = state.hits.length >= limit;
        if (!isBlocked) state.hits.push(now + ttl);
      } else {
        state.hits.push(now + ttl);
        if (state.hits.length > limit) {
          isBlocked = true;
          state.blockedUntil = now + blockDuration;
        }
      }
    }

    const oldest = state.hits.length ? Math.min(...state.hits) : now + ttl;
    const record: ThrottleRecord = {
      totalHits: state.hits.length + (isBlocked && blockDuration <= 0 ? 1 : 0),
      timeToExpire: seconds(oldest),
      isBlocked,
      timeToBlockExpire: isBlocked ? seconds(state.blockedUntil || oldest) : 0,
    };
    await this.storage.put(STATE_KEY, state);
    await this.storage.setAlarm(Math.max(oldest, state.blockedUntil) + 1000);
    return record;
  }

  /** Alarm: forget the counter once nothing in it can matter any more. */
  async alarm(): Promise<void> {
    const state = await this.storage.get<ThrottleState>(STATE_KEY);
    const now = this.now();
    if (!state) return;
    const live = state.hits.some((expiresAt) => expiresAt > now) || state.blockedUntil > now;
    if (!live) await this.storage.delete(STATE_KEY);
  }
}

export type ThrottleObjectStub = Pick<ThrottleObjectCore, 'increment'>;
