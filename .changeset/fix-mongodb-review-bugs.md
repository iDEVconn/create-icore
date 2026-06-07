---
'@icore/auth-mongodb': patch
'@icore/storage-mongodb': patch
'@idevconn/create-icore': patch
---

Fix MongoDB review bugs: guard model re-registration, fix expiresIn calculation, escape regex in list(), replace `as never` cast, drop non-existent uuid v14 dep.
