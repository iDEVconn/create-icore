import { NotesResolver } from '../notes/graphql/notes.resolver';
import { ProfileResolver } from '../profile/graphql/profile.resolver';
import { StorageResolver } from '../storage/graphql/storage.resolver';

/**
 * Resolvers printed into apps/api/schema.gql (`yarn nx run api:graphql-schema`) and checked
 * against it by schema.unit.test.ts. Kept apart from ApiSurfacesModule so printing the schema
 * never loads Apollo or the microservice client modules.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const API_SURFACE_RESOLVERS: Function[] = [NotesResolver, ProfileResolver, StorageResolver];
