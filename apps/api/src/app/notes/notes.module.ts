import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AbilitiesModule } from '../abilities/abilities.module';
import { NotesController } from './notes.controller';
import { NotesGatewayService } from './notes-gateway.service';

@Module({
  imports: [NotesClientModule.forRoot(), AbilitiesModule],
  controllers: [NotesController],
  providers: [NotesGatewayService],
  exports: [NotesGatewayService],
})
export class NotesModule {}
