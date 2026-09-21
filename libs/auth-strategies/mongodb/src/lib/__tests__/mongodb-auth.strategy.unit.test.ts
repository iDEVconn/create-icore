import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, Connection } from 'mongoose';
import { RpcException } from '@nestjs/microservices';
import { MongoDbAuthStrategy } from '../mongodb-auth.strategy';
import { runAuthContract } from '@icore/shared/testing';

describe('MongoDbAuthStrategy', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let strategy: MongoDbAuthStrategy;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    const conn = await connect(uri);
    connection = conn.connection;
  }, 30000);

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    if (connection.db) {
      const collections = await connection.db.collections();
      for (const collection of collections) {
        await collection.deleteMany({});
      }
    }
  });

  runAuthContract('mongodb', () => {
    if (!strategy) {
      strategy = new MongoDbAuthStrategy({
        connection,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '1h',
      });
    }
    return strategy;
  });

  describe('refresh()', () => {
    it("throws RpcException('invalid_refresh_token') on a genuinely dead refresh token", async () => {
      // RpcException (not a plain Error) is required here — NestJS's RPC
      // exception filter discards a plain Error's message entirely when it
      // crosses the gateway<->microservice transport, so auth.guard.ts could
      // never distinguish a dead refresh token from a transient outage.
      const s = new MongoDbAuthStrategy({
        connection,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '1h',
      });

      let caught: unknown;
      try {
        await s.refresh('not-a-real-refresh-token');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(RpcException);
      expect((caught as RpcException).getError()).toBe('invalid_refresh_token');
    });
  });
});
