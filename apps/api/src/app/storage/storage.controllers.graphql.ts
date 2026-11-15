import { StorageFilesController } from './storage-files.controller';

// api=graphql variant of storage.controllers.ts: upload and download stay REST, while list,
// signed-url and remove move to StorageResolver. create-icore swaps it over storage.controllers.ts.
export const STORAGE_REST_CONTROLLERS = [StorageFilesController];
