import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AbilitiesModule } from '../abilities/abilities.module';
import { NotesController } from './notes.controller';

@Module({
  imports: [NotesClientModule.forRoot(), AbilitiesModule],
  controllers: [NotesController],
})
export class NotesModule {}
