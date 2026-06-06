import { authMongodb } from './auth-mongodb';

describe('authMongodb', () => {
  it('should work', () => {
    expect(authMongodb()).toEqual('auth-mongodb');
  });
});
