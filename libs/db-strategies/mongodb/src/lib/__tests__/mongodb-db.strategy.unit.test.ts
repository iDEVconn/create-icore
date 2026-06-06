import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, Connection } from 'mongoose';
import { MongoDbDBStrategy } from '../mongodb-db.strategy';
import { runDBContract } from '@icore/shared/testing';

describe('MongoDbDBStrategy', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let strategy: MongoDbDBStrategy;

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

  runDBContract('mongodb', () => {
    if (!strategy) {
      strategy = new MongoDbDBStrategy({ connection });
    }
    return strategy;
  });
});
