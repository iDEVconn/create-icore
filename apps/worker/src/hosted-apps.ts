// The Worker hosts the gateway's and the microservices' own modules in one isolate. This is the ONLY
// file that imports another app's source, and the only one `create-icore` rewrites when it scaffolds
// a project with fewer features (see `wire-host.ts`): everything else reads these two lists.
import type { Type } from '@nestjs/common';
import { AuthModule } from '../../api/src/app/auth/auth.module';
import { AbilitiesModule } from '../../api/src/app/abilities/abilities.module';
import { ProfileModule } from '../../api/src/app/profile/profile.module';
import { StorageModule } from '../../api/src/app/storage/storage.module';
import { NotesModule } from '../../api/src/app/notes/notes.module';
import { AppModule as AuthMsModule } from '../../microservices/auth/src/app/app.module';
import { AppModule as UploadMsModule } from '../../microservices/upload/src/app/app.module';
import { AppModule as NotesMsModule } from '../../microservices/notes/src/app/app.module';

/** The gateway's feature modules (the Worker adds its own config, throttler and bindings). */
export const GATEWAY_FEATURE_MODULES: Type<unknown>[] = [
  AuthModule,
  AbilitiesModule,
  ProfileModule,
  StorageModule,
  NotesModule,
];

/**
 * `AuthModule` registers the global `ThrottlerGuard` next to the auth guards. A project without auth
 * has no `AuthModule`, so the Worker registers the guard itself (rate limiting never goes missing).
 */
export const FEATURES_REGISTER_THROTTLER_GUARD = true;

/** The microservices started next to the gateway; `<PREFIX>_TRANSPORT=local` wires each to it. */
export const MICROSERVICES: { prefix: string; module: Type<unknown> }[] = [
  { prefix: 'AUTH', module: AuthMsModule },
  { prefix: 'UPLOAD', module: UploadMsModule },
  { prefix: 'NOTES', module: NotesMsModule },
];
