import { MongoDbDbModule, MONGODB_DB_REQUIRED_ENV } from '../mongodb-db.module';

describe('MongoDbDbModule', () => {
  it('requires the mongo uri', () => {
    expect(MONGODB_DB_REQUIRED_ENV).toEqual(['MONGODB_URI']);
  });
  it('forRoot returns a DynamicModule importing Mongoose and exporting DBStrategy', () => {
    const dm = MongoDbDbModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbDbModule);
    expect(dm.exports).toContain('DBStrategy');
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
