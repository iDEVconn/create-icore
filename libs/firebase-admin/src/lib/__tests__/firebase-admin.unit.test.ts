import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apps, cert, initializeApp, app } = vi.hoisted(() => {
  const apps: unknown[] = [];
  return {
    apps,
    cert: vi.fn((sa: unknown) => ({ __cert: sa })),
    initializeApp: vi.fn((opts: unknown) => {
      const created = { __app: opts };
      apps.push(created);
      return created;
    }),
    app: vi.fn(() => apps[0]),
  };
});

vi.mock('firebase-admin', () => ({
  get apps() {
    return apps;
  },
  app,
  initializeApp,
  credential: { cert },
}));

import { FIREBASE_ADMIN_REQUIRED_ENV, getFirebaseAdmin } from '../firebase-admin';

type Cfg = {
  getOrThrow: (k: string) => string;
  get: (k: string) => string | undefined;
};

function makeCfg(extra: Record<string, string> = {}): Cfg {
  const env: Record<string, string> = {
    FB_ADMIN_TYPE: 'service_account',
    FB_ADMIN_PROJECT_ID: 'proj',
    FB_ADMIN_PRIVATE_KEY_ID: 'kid',
    FB_ADMIN_PRIVATE_KEY: '-----BEGIN-----\\nABC\\n-----END-----',
    FB_ADMIN_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
    FB_ADMIN_CLIENT_ID: 'cid',
    FB_ADMIN_AUTH_URI: 'https://accounts.google.com/o/oauth2/auth',
    FB_ADMIN_TOKEN_URI: 'https://oauth2.googleapis.com/token',
    FB_ADMIN_AUTH_PROVIDER_X509_CERT_URL: 'https://www.googleapis.com/oauth2/v1/certs',
    FB_ADMIN_CLIENT_X509_CERT_URL: 'https://www.googleapis.com/robot/v1/metadata/x509/svc',
    FB_ADMIN_UNIVERSE_DOMAIN: 'googleapis.com',
    ...extra,
  };
  return {
    getOrThrow: (k) => {
      if (!(k in env)) throw new Error(`missing ${k}`);
      return env[k];
    },
    get: (k) => env[k],
  };
}

describe('getFirebaseAdmin', () => {
  beforeEach(() => {
    apps.length = 0;
    cert.mockClear();
    initializeApp.mockClear();
    app.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('requires the full Firebase service-account env contract (all 11 keys)', () => {
    expect([...FIREBASE_ADMIN_REQUIRED_ENV]).toEqual([
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
    ]);
  });

  it('passes the complete service account to cert() with escaped newlines fixed', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getFirebaseAdmin(makeCfg() as any);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    const sa = cert.mock.calls[0][0] as Record<string, string>;
    expect(sa['project_id']).toBe('proj');
    expect(sa['client_email']).toBe('svc@proj.iam.gserviceaccount.com');
    expect(sa['private_key_id']).toBe('kid');
    expect(sa['universe_domain']).toBe('googleapis.com');
    // \n escapes in the env value are turned into real newlines
    expect(sa['private_key']).toContain('\n');
    expect(sa['private_key']).not.toContain('\\n');
  });

  it('initializes the default app only once (guards on admin.apps)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = makeCfg() as any;
    getFirebaseAdmin(cfg);
    getFirebaseAdmin(cfg);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(app).toHaveBeenCalledTimes(1); // second call returns the existing app
  });
});
