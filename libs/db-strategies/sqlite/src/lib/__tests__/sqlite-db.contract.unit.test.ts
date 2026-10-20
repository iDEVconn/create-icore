import { runDBContract } from '@icore/shared/testing';
import { SqliteDBStrategy } from '../sqlite-db.strategy';

runDBContract('SqliteDBStrategy', () => new SqliteDBStrategy({ databasePath: ':memory:' }));
