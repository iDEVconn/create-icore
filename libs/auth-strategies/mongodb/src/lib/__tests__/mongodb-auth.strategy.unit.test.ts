import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, Connection } from 'mongoose';
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
});
