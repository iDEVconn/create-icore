---
'@icore/auth-mongodb': patch
'@icore/storage-mongodb': patch
'@idevconn/create-icore': patch
---

Fix MongoDB review bugs and wire GridFS download: guard model re-registration, fix expiresIn calculation, escape regex in list(), replace `as never` cast, drop non-existent uuid v14 dep. Add downloadBuffer to StorageStrategy interface + MongoDbStorageStrategy impl + upload MS handler + UploadClientService method + GET /api/storage/file gateway endpoint so MongoDB storage downloads actually work.
