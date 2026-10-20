import { runDBContract } from '@icore/shared/testing';
import { D1DBStrategy } from '../d1-db.strategy';
import { createSqliteD1Client } from '../testing/sqlite-d1-client';

runDBContract('D1DBStrategy (typed params)', () => new D1DBStrategy(createSqliteD1Client()));

runDBContract(
  'D1DBStrategy (stringified params)',
  () => new D1DBStrategy(createSqliteD1Client({ stringifyParams: true })),
);
