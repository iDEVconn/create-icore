---
'@idevconn/create-icore': minor
---

feat(api): `PATCH /api/profile {name}` and GraphQL `updateProfile(name:)` (plus `name` on `GET /api/profile` and `me`). The display name is stored at the identity provider through the new `AuthStrategy.getProfile/updateProfile` (Supabase `user_metadata`, Firebase `displayName`, MongoDB field, Postgres column added automatically). The client profile pages, REST and GraphQL queries now read and save it; `GraphQL` clients no longer fall back to a REST request for saving.
