import { storageMongodb } from './storage-mongodb';

describe('storageMongodb', () => {
  it('should work', () => {
    expect(storageMongodb()).toEqual('storage-mongodb');
  });
});
