# Plan: MongoDB Integration

Full-stack integration of MongoDB as a primary provider for Database, Storage, and Authentication.

## Problem

Currently, iCore supports Supabase and Firebase. Adding MongoDB provides a self-hostable, NoSQL alternative that doesn't rely on third-party cloud platforms for core functionality.

## Solution

Implement the Strategy pattern for MongoDB across three domains:

1.  **Database**: CRUD operations using Mongoose.
2.  **Storage**: File management using MongoDB GridFS.
3.  **Authentication**: Custom Identity Provider storing users and sessions in MongoDB.

## Tasks

### 1. Library Generation

- [x] `libs/db-strategies/mongodb`
- [x] `libs/storage-strategies/mongodb`
- [x] `libs/auth-strategies/mongodb`

### 2. Implementation

- [x] `MongoDbDBStrategy`: Generic document storage (id + data).
- [x] `MongoDbStorageStrategy`: GridFS implementation with signed URL support.
- [x] `MongoDbAuthStrategy`: Password-based auth, JWT, and session management.

### 3. CLI Updates (`create-icore`)

- [x] Add `mongodb` option to `AuthProvider`, `DbProvider`, and `UploadProvider`.
- [x] Update prompts to include MongoDB.
- [x] Update scaffolding logic to install dependencies (`mongoose`, `bcrypt`, etc.) and set up `.env` defaults.

### 4. Documentation

- [x] Update `AGENTS.md` architecture and provider sections.
- [x] Create `docs/runbooks/mongodb.md`.
- [x] Create this plan file.

## Verification

- [x] Build all libraries: `nx build db-mongodb`, `nx build storage-mongodb`, `nx build auth-mongodb`.
- [x] Contract tests: All tests passed for DB, Storage, and Auth strategies.
- [x] Linting and formatting.
