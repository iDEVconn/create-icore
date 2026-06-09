import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotesController } from './notes.controller';
import { DbProviderModule } from './db.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/notes/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    DbProviderModule,
  ],
  controllers: [NotesController],
})
export class AppModule {}
