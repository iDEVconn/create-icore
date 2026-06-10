import { MongoDbStorageModule, MONGODB_STORAGE_REQUIRED_ENV } from '../mongodb-storage.module';

describe('MongoDbStorageModule', () => {
  it('requires the mongo uri', () => {
    expect(MONGODB_STORAGE_REQUIRED_ENV).toEqual(['MONGODB_URI']);
  });
  it('forRoot returns a DynamicModule importing Mongoose and exporting StorageStrategy', () => {
    const dm = MongoDbStorageModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbStorageModule);
    expect(dm.exports).toContain('StorageStrategy');
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
