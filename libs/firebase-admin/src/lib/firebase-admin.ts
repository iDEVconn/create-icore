import * as admin from 'firebase-admin';

/**
 * Minimal structural view of NestJS's `ConfigService` — just the two readers
 * this helper needs. Declaring it structurally keeps the lib free of a
 * `@nestjs/config` dependency while still accepting a real `ConfigService` at
 * every call site.
 */
export interface FirebaseConfigReader {
  getOrThrow<T = string>(key: string): T;
  get<T = string>(key: string): T | undefined;
}

/**
 * The full Firebase service-account env contract.
 *
 * These are exactly the keys Firebase emits in the service-account JSON you
 * download from Project Settings → Service accounts. Every microservice that
 * talks to Firebase (auth, storage, Firestore) requires all of them, so each
 * MS spreads this into its own REQUIRED_ENV map — keeping the contract in one
 * place instead of three drifting copies.
 */
export const FIREBASE_ADMIN_REQUIRED_ENV = [
  'FB_ADMIN_TYPE',
  'FB_ADMIN_PROJECT_ID',
  'FB_ADMIN_PRIVATE_KEY_ID',
  'FB_ADMIN_PRIVATE_KEY',
  'FB_ADMIN_CLIENT_EMAIL',
  'FB_ADMIN_CLIENT_ID',
  'FB_ADMIN_AUTH_URI',
  'FB_ADMIN_TOKEN_URI',
  'FB_ADMIN_AUTH_PROVIDER_X509_CERT_URL',
  'FB_ADMIN_CLIENT_X509_CERT_URL',
  'FB_ADMIN_UNIVERSE_DOMAIN',
] as const;

/**
 * Initialises the default Firebase Admin app exactly once and returns it.
 *
 * The Admin SDK throws "default app already exists" if `initializeApp` runs
 * twice in a process, so this guards on `admin.apps.length` and is safe to call
 * from every Firebase consumer (auth / storage / notes). Callers then use the
 * returned app: `getFirebaseAdmin(cfg).auth()`, `.firestore()`, `.storage()`.
 *
 * The full service-account object is passed to `cert()` — Firebase only mints
 * tokens from project_id/client_email/private_key, but feeding the complete
 * downloaded JSON keeps the code aligned with the documented FB_ADMIN_* env.
 */
export function getFirebaseAdmin(cfg: FirebaseConfigReader): admin.app.App {
  if (admin.apps.length > 0) return admin.app();

  return admin.initializeApp({
    credential: admin.credential.cert({
      type: cfg.getOrThrow<string>('FB_ADMIN_TYPE'),
      project_id: cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID'),
      private_key_id: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY_ID'),
      private_key: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      client_email: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
      client_id: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_ID'),
      auth_uri: cfg.getOrThrow<string>('FB_ADMIN_AUTH_URI'),
      token_uri: cfg.getOrThrow<string>('FB_ADMIN_TOKEN_URI'),
      auth_provider_x509_cert_url: cfg.getOrThrow<string>('FB_ADMIN_AUTH_PROVIDER_X509_CERT_URL'),
      client_x509_cert_url: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_X509_CERT_URL'),
      universe_domain: cfg.getOrThrow<string>('FB_ADMIN_UNIVERSE_DOMAIN'),
    } as unknown as admin.ServiceAccount),
    // Optional: the storage MS also passes the bucket name explicitly to
    // .bucket(); set here too so admin.storage().bucket() (no arg) works.
    storageBucket: cfg.get<string>('FIREBASE_STORAGE_BUCKET'),
  });
}
