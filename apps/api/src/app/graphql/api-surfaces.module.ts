import { Module } from '@nestjs/common';
import { NotesGraphqlModule } from '../notes/graphql/notes-graphql.module';
import { ProfileGraphqlModule } from '../profile/graphql/profile-graphql.module';
import { StorageGraphqlModule } from '../storage/graphql/storage-graphql.module';
import { ApiGraphqlModule } from './graphql.module';

/**
 * The GraphQL API: /api/graphql plus every feature's GraphQL surface. Needs a global
 * ThrottlerModule (request throttle) and the gateway's AuthGuard / CsrfGuard.
 */
@Module({
  imports: [ApiGraphqlModule, NotesGraphqlModule, ProfileGraphqlModule, StorageGraphqlModule],
})
export class ApiSurfacesModule {}
