# @icore/auth-mongodb

## 0.0.2

### Patch Changes

- 2c29eac: Fix ESLint issues, update dependencies, and add MongoDB configuration examples to .env templates.
- af27cae: Fix MongoDB review bugs and wire GridFS download: guard model re-registration, fix expiresIn calculation, escape regex in list(), replace `as never` cast, drop non-existent uuid v14 dep. Add downloadBuffer to StorageStrategy interface + MongoDbStorageStrategy impl + upload MS handler + UploadClientService method + GET /api/storage/file gateway endpoint so MongoDB storage downloads actually work.
