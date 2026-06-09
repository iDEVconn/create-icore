import type { Manifest, Unit } from './types.js';

const EMPTY: Unit = { libDirs: [], deps: {}, tsPaths: {} };

export const MANIFEST = {
  auth: {
    supabase: {
      libDirs: ['libs/auth-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-supabase',
        symbol: 'SupabaseAuthModule',
        into: 'auth',
      },
      appTests: [
        'apps/microservices/auth/src/app/__tests__/auth.controller.supabase.integration.unit.test.ts',
      ],
    },
    firebase: {
      libDirs: ['libs/auth-strategies/firebase'],
      deps: {},
      tsPaths: { '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-firebase',
        symbol: 'FirebaseAuthModule',
        into: 'auth',
      },
      appTests: [
        'apps/microservices/auth/src/app/__tests__/auth.controller.firebase.integration.unit.test.ts',
      ],
    },
    mongodb: {
      libDirs: ['libs/auth-strategies/mongodb'],
      deps: { mongoose: '^9.6.3' },
      tsPaths: { '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'] },
      nestModule: { importFrom: '@icore/auth-mongodb', symbol: 'MongoDbAuthModule', into: 'auth' },
    },
  },
  storage: {
    supabase: {
      libDirs: ['libs/storage-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/storage-supabase': ['libs/storage-strategies/supabase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-supabase',
        symbol: 'SupabaseStorageModule',
        into: 'upload',
      },
    },
    firebase: {
      libDirs: ['libs/storage-strategies/firebase'],
      deps: {},
      tsPaths: { '@icore/storage-firebase': ['libs/storage-strategies/firebase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-firebase',
        symbol: 'FirebaseStorageModule',
        into: 'upload',
      },
    },
    cloudinary: {
      libDirs: ['libs/storage-strategies/cloudinary'],
      deps: { cloudinary: '^2.10.0' },
      tsPaths: { '@icore/storage-cloudinary': ['libs/storage-strategies/cloudinary/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-cloudinary',
        symbol: 'CloudinaryStorageModule',
        into: 'upload',
      },
    },
    mongodb: {
      libDirs: ['libs/storage-strategies/mongodb'],
      deps: { mongoose: '^9.6.3' },
      tsPaths: { '@icore/storage-mongodb': ['libs/storage-strategies/mongodb/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-mongodb',
        symbol: 'MongoDbStorageModule',
        into: 'upload',
      },
    },
  },
  db: {
    supabase: {
      libDirs: ['libs/db-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/db-supabase': ['libs/db-strategies/supabase/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-supabase', symbol: 'SupabaseDbModule', into: 'notes' },
    },
    firebase: {
      libDirs: ['libs/db-strategies/firestore'],
      deps: {},
      tsPaths: { '@icore/db-firestore': ['libs/db-strategies/firestore/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-firestore', symbol: 'FirestoreDbModule', into: 'notes' },
    },
    mongodb: {
      libDirs: ['libs/db-strategies/mongodb'],
      deps: { mongoose: '^9.6.3' },
      tsPaths: { '@icore/db-mongodb': ['libs/db-strategies/mongodb/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-mongodb', symbol: 'MongoDbDbModule', into: 'notes' },
    },
  },
  feature: { notes: EMPTY, payment: EMPTY, jobs: EMPTY },
  ui: { shadcn: EMPTY, antd: EMPTY, mui: EMPTY },
  transport: { tcp: EMPTY, redis: EMPTY, nats: EMPTY, mqtt: EMPTY, rmq: EMPTY, kafka: EMPTY },
  shared: {
    firebaseAdmin: {
      libDirs: ['libs/firebase-admin'],
      deps: { 'firebase-admin': '^13.10.0' },
      tsPaths: { '@icore/firebase-admin': ['libs/firebase-admin/src/index.ts'] },
    },
  },
} satisfies Manifest;
