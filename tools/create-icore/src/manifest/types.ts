import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  UiLibrary,
  MsTransport,
} from '../lib/options.js';

/** What a single selectable unit contributes to the generated project. */
export interface Unit {
  /** Package directories copied verbatim iff this unit is selected. */
  libDirs: string[];
  /** Raw (non-`@icore`) deps merged into the root package.json. */
  deps: Record<string, string>;
  /** Path aliases merged into tsconfig.base.json. */
  tsPaths: Record<string, string[]>;
  /** A block appended to an env file (chosen units only). */
  envBlock?: { file: string; lines: string };
  /** A NestJS DynamicModule this unit owns, wired into a composition point. */
  nestModule?: {
    importFrom: string;
    symbol: string;
    into: 'auth' | 'upload' | 'notes' | 'gateway';
  };
  /** Entry added to GATEWAY_SERVICES in apps/api/src/app/gateway-services.ts. */
  gatewayService?: { name: string; prefix: string };
  /** Contribution to the client sidebar/routes. */
  clientNav?: { route: string; navEntry: string };
  /** A plain NestJS module the gateway app.module imports (no forRoot). */
  gatewayModule?: { importFrom: string; symbol: string };
  /** Name of a docker-compose service block this feature owns. */
  dockerService?: 'jobs';
  /** App-level (not lib) test files that belong to this unit and must be removed
   *  when the unit is NOT selected (they import the unit's now-absent lib). */
  appTests?: string[];
}

export type StorageProvider = Exclude<UploadProvider, 'none'>;

export interface Manifest {
  auth: Record<AuthProvider, Unit>;
  storage: Record<StorageProvider, Unit>;
  db: Record<DbProvider, Unit>;
  feature: { notes: Unit; payment: Unit; jobs: Unit };
  ui: Record<UiLibrary, Unit>;
  transport: Record<MsTransport, Unit>;
  /** Shared units pulled in by a cross-axis rule (not a direct user choice). */
  shared: { firebaseAdmin: Unit };
}
