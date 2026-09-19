import IORedis from 'ioredis';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { RedisSessionStore } from '../redis-session-store';
import { runSessionStoreContract } from './session-store.contract';

// Needs a real Redis at REDIS_TEST_URL (defaults to the docker-compose
// service on localhost:6379) -- distributed-lock correctness cannot be
// faked, matching this repo's existing mongodb-memory-server precedent for
// "this property only means something against the real backend."
const url = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
let redis: IORedis;

beforeAll(() => {
  redis = new IORedis(url);
});

afterEach(async () => {
  await redis.flushdb();
});

afterAll(async () => {
  await redis.quit();
});

runSessionStoreContract('RedisSessionStore', () => new RedisSessionStore(redis));
