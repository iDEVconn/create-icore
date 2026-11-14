import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AbilitiesModule } from '../../abilities/abilities.module';
import { NotesGatewayService } from '../notes-gateway.service';
import { NotesResolver } from './notes.resolver';

/**
 * GraphQL surface of notes. Independent of the REST NotesModule (an api=graphql project ships
 * without it), so it provides NotesGatewayService itself.
 */
@Module({
  imports: [NotesClientModule.forRoot(), AbilitiesModule],
  providers: [NotesGatewayService, NotesResolver],
  exports: [NotesGatewayService],
})
export class NotesGraphqlModule {}
