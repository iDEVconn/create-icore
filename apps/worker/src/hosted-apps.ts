// The Worker hosts the gateway's and the microservices' own modules in one isolate. Every import
// of another app's source lives in this file, so the set of hosted features is one place to edit.
export { AuthModule } from '../../api/src/app/auth/auth.module';
export { AbilitiesModule } from '../../api/src/app/abilities/abilities.module';
export { ProfileModule } from '../../api/src/app/profile/profile.module';
export { StorageModule } from '../../api/src/app/storage/storage.module';
export { NotesModule } from '../../api/src/app/notes/notes.module';
export { throttlerOptions } from '../../api/src/app/http/throttler.config';
export { AppModule as AuthMsModule } from '../../microservices/auth/src/app/app.module';
export { AppModule as UploadMsModule } from '../../microservices/upload/src/app/app.module';
export { AppModule as NotesMsModule } from '../../microservices/notes/src/app/app.module';
