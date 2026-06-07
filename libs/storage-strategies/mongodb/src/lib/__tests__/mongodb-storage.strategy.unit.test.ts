import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, Connection } from 'mongoose';
import { MongoDbStorageStrategy } from '../mongodb-storage.strategy';
import { runStorageContract } from '@icore/shared/testing';

describe('MongoDbStorageStrategy', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let strategy: MongoDbStorageStrategy;

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

  runStorageContract('mongodb', () => {
    if (!strategy) {
      strategy = new MongoDbStorageStrategy({ connection });
    }
    return strategy;
  });
});
