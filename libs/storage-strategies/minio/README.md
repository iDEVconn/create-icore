# storage-minio

`StorageStrategy` implementation backed by MinIO (or any S3-compatible object store: Backblaze B2, Cloudflare R2, Amazon S3). See `docs/architecture` / root `AGENTS.md` "MinIO / S3-compatible" for env vars and setup.

## Building

Run `nx build storage-minio` to build the library.

## Running unit tests

Run `nx test storage-minio` to execute the unit tests via [Vitest](https://vitest.dev/).
