# Runbook: MongoDB Setup

This runbook describes how to set up and configure MongoDB as a provider for iCore.

## Prerequisites

- MongoDB instance (local or Atlas)
- Node.js 24+
- iCore project scaffolded with MongoDB options

## Local Setup (Docker)

If you have Docker installed, you can quickly spin up a MongoDB instance:

```bash
docker run -d --name icore-mongo -p 27017:27017 mongo:latest
```

## Configuration

Update your `.env` files in the microservices or root directory:

### Auth Microservice (`apps/microservices/auth/.env`)

```env
AUTH_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/icore-auth
JWT_SECRET=your-secure-secret
```

### Storage Microservice (`apps/microservices/upload/.env`)

```env
STORAGE_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/icore-upload
```

### Notes Microservice (Example) (`apps/microservices/notes/.env`)

```env
DB_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/icore-data
```

## Implementation Details

### DB Strategy

The `MongoDbDBStrategy` uses `@nestjs/mongoose` and `mongoose`. It creates dynamic models for collections. Each document is stored with an `id` field and a `data` field (Mixed type).

### Storage Strategy (GridFS)

The `MongoDbStorageStrategy` uses GridFS to store files. It creates signed URLs by returning a temporary link that points to the gateway, which then streams the file from MongoDB.

### Auth Strategy

The `MongoDbAuthStrategy` handles:

- User registration and login (bcrypt for password hashing)
- JWT token issuance and verification
- Session management (refresh tokens stored in MongoDB)

## Verification

To verify the setup:

1. Start the microservices: `nx run-many -t serve`
2. Run unit tests: `nx test db-mongodb`, `nx test storage-mongodb`, `nx test auth-mongodb`
3. Try to register a user via the client or API.
4. Upload a file and verify it appears in the `fs.files` and `fs.chunks` collections in MongoDB.
