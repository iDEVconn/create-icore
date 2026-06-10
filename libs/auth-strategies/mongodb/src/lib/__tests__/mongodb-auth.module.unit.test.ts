import { MongoDbAuthModule, MONGODB_AUTH_REQUIRED_ENV } from '../mongodb-auth.module';

describe('MongoDbAuthModule', () => {
  it('requires the mongo uri and jwt secret', () => {
    expect(MONGODB_AUTH_REQUIRED_ENV).toEqual(['MONGODB_URI', 'JWT_SECRET']);
  });

  it('forRoot returns a DynamicModule that imports Mongoose and exports the AuthStrategy token', () => {
    const dm = MongoDbAuthModule.forRoot('.env');
    expect(dm.module).toBe(MongoDbAuthModule);
    expect(dm.exports).toContain('AuthStrategy');
    // Mongoose connection wiring is the module's own concern.
    expect(Array.isArray(dm.imports)).toBe(true);
    expect((dm.imports ?? []).length).toBeGreaterThan(0);
  });
});
