import type IORedis from 'ioredis';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { RedisSessionStore } from '../redis-session-store';
import { runSessionStoreContract } from './session-store.contract';
import { startTestRedis, type TestRedis } from './redis-test-server';

// Needs a REAL Redis -- distributed-lock correctness cannot be faked, matching
// this repo's mongodb-memory-server precedent for "this property only means
// something against the real backend." startTestRedis() uses REDIS_TEST_URL /
// localhost:6379 when reachable (CI service container) and otherwise starts a
// local throw-away server via redis-memory-server.
let testRedis: TestRedis;
let redis: IORedis;

// First local run (no Redis reachable) compiles Redis once, ~5 min on a loaded
// machine, then it is cached under node_modules/.cache -- hence the long timeout.
// With a `redis-server` on PATH, set REDISMS_SYSTEM_BINARY=$(which redis-server) to skip it.
beforeAll(async () => {
  testRedis = await startTestRedis();
  redis = testRedis.redis;
}, 900_000);

afterEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await testRedis?.stop();
});

runSessionStoreContract('RedisSessionStore', () => new RedisSessionStore(redis));
