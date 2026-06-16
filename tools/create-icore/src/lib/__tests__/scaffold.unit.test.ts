import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeAuthEnv,
  writeGatewayEnv,
  writeUploadEnv,
  writeRootEnv,
  removeUploadStack,
  removeAuthOnlyPaths,
  applyAuthNoneVariants,
  removeAuthTsconfigPaths,
  removeDockerComposeAuthService,
  removeStrategiesLib,
  removeFirebaseAdminLib,
  rewriteRootPackageJson,
  pruneRootProviderDeps,
} from '../scaffold.js';
import type { CreateIcoreOptions } from '../options.js';

const baseOpts: CreateIcoreOptions = {
  projectName: 'my-app',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'cloudinary',
  payment: 'none',
  jobs: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

let dir: string;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'icore-test-'));
  await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
  await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
  await mkdir(join(dir, 'apps/api'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/auth/.env.example'),
    [
      'AUTH_TRANSPORT=tcp',
      'AUTH_HOST=127.0.0.1',
      'AUTH_PORT=4001',
      '# AUTH_REDIS_URL=redis://localhost:6379',
      'AUTH_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/microservices/upload/.env.example'),
    [
      'UPLOAD_TRANSPORT=tcp',
      'UPLOAD_HOST=127.0.0.1',
      'UPLOAD_PORT=4002',
      '# UPLOAD_REDIS_URL=redis://localhost:6379',
      'STORAGE_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/api/.env.example'),
    ['AUTH_TRANSPORT=tcp', '# AUTH_REDIS_URL=redis://localhost:6379', 'UPLOAD_TRANSPORT=tcp'].join(
      '\n',
    ),
  );
});

describe('writeAuthEnv', () => {
  it('replaces AUTH_PROVIDER with the chosen value', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_PROVIDER=firebase');
    expect(env).not.toContain('AUTH_PROVIDER=supabase');
  });

  it('keeps AUTH_TRANSPORT=tcp by default', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=tcp');
  });

  it('uncomments AUTH_REDIS_URL when transport=redis', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, transport: 'redis' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_REDIS_URL=redis://localhost:6379');
    expect(env).not.toContain('# AUTH_REDIS_URL=');
  });
});

describe('writeUploadEnv', () => {
  it('replaces STORAGE_PROVIDER', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'cloudinary' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).toContain('STORAGE_PROVIDER=cloudinary');
  });

  it('is a no-op when upload === "none"', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'none' });
    // The .env file should NOT have been created
    await expect(access(join(dir, 'apps/microservices/upload/.env'))).rejects.toThrow();
  });
});

describe('writeGatewayEnv', () => {
  it('replaces both transports', async () => {
    await writeGatewayEnv(dir, { ...baseOpts, targetDir: dir, transport: 'nats' });
    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=nats');
    expect(env).toContain('UPLOAD_TRANSPORT=nats');
  });

  it('strips AUTH_* lines when authProvider=none', async () => {
    await writeGatewayEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'none' });
    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).not.toContain('AUTH_TRANSPORT');
    expect(env).not.toContain('AUTH_REDIS_URL');
    expect(env).toContain('UPLOAD_TRANSPORT');
  });
});

describe('writeRootEnv', () => {
  it('writes DB_PROVIDER=<chosen> to .env when dbProvider=firebase', async () => {
    await writeRootEnv(dir, { ...baseOpts, targetDir: dir, dbProvider: 'firebase' });
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('DB_PROVIDER=firebase');
  });

  it('writes DB_PROVIDER=supabase to .env when dbProvider=supabase', async () => {
    await writeRootEnv(dir, { ...baseOpts, targetDir: dir, dbProvider: 'supabase' });
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('DB_PROVIDER=supabase');
  });
});

describe('removeUploadStack', () => {
  it('removes upload MS, storage strategy libs, upload-client, and gateway storage dir', async () => {
    // Pre-populate the paths that removeUploadStack should delete
    await mkdir(join(dir, 'apps/microservices/upload-e2e'), { recursive: true });
    await writeFile(join(dir, 'apps/microservices/upload-e2e/placeholder.ts'), '');
    await mkdir(join(dir, 'libs/storage-strategies/supabase'), { recursive: true });
    await writeFile(
      join(dir, 'libs/storage-strategies/supabase/package.json'),
      JSON.stringify({ name: 'storage-supabase' }),
    );
    await mkdir(join(dir, 'libs/upload-client'), { recursive: true });
    await writeFile(
      join(dir, 'libs/upload-client/package.json'),
      JSON.stringify({ name: 'upload-client' }),
    );
    await mkdir(join(dir, 'apps/api/src/app/storage'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/storage/storage.module.ts'),
      'export class StorageModule {}',
    );
    await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/app.module.ts'),
      [
        "import { StorageModule } from './storage/storage.module';",
        "import { AuthModule } from './auth/auth.module';",
        '@Module({ imports: [AuthModule, StorageModule] })',
        'export class AppModule {}',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'apps/api/.env'),
      [
        'AUTH_TRANSPORT=tcp',
        'UPLOAD_TRANSPORT=tcp',
        'UPLOAD_HOST=127.0.0.1',
        'MAX_FILE_SIZE_KB=2048',
      ].join('\n'),
    );
    await writeFile(join(dir, 'Dockerfile.ms-upload'), '# upload dockerfile');
    await writeFile(
      join(dir, 'docker-compose.yml'),
      [
        'services:',
        '  upload:',
        '    build:',
        '      context: .',
        '      dockerfile: Dockerfile.ms-upload',
        '    restart: unless-stopped',
        '  gateway:',
        '    environment:',
        '      API_PORT: 3001',
        '      UPLOAD_TRANSPORT: redis',
        '      UPLOAD_REDIS_URL: redis://redis:6379',
        '    depends_on:',
        '      redis:',
        '        condition: service_healthy',
        '      upload:',
        '        condition: service_started',
        'networks:',
        '  icore:',
        '    driver: bridge',
      ].join('\n'),
    );

    await removeUploadStack(dir);

    // upload directories are gone
    await expect(access(join(dir, 'apps/microservices/upload'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/microservices/upload-e2e'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/upload-client'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/api/src/app/storage'))).rejects.toThrow();
    await expect(access(join(dir, 'Dockerfile.ms-upload'))).rejects.toThrow();

    // StorageModule stripped from app.module.ts
    const appModule = await readFile(join(dir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(appModule).not.toContain('StorageModule');

    // UPLOAD_* and MAX_FILE_SIZE_KB stripped from gateway .env
    const gatewayEnv = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(gatewayEnv).toContain('AUTH_TRANSPORT=tcp');
    expect(gatewayEnv).not.toContain('UPLOAD_TRANSPORT');
    expect(gatewayEnv).not.toContain('UPLOAD_HOST');
    expect(gatewayEnv).not.toContain('MAX_FILE_SIZE_KB');

    // upload service stripped from docker-compose.yml
    const compose = await readFile(join(dir, 'docker-compose.yml'), 'utf8');
    expect(compose).not.toContain('Dockerfile.ms-upload');
    expect(compose).not.toContain('UPLOAD_TRANSPORT');
    expect(compose).not.toContain('UPLOAD_REDIS_URL');
    expect(compose).toContain('gateway:');
    const gatewaySection = compose.slice(compose.indexOf('  gateway:'));
    expect(gatewaySection).not.toContain('upload:');
  });

  it('removes @icore/upload-client and @types/multer from apps/api/package.json', async () => {
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify({
        name: 'api',
        dependencies: { '@icore/upload-client': '*', '@icore/auth-client': '*' },
        devDependencies: { '@types/multer': '^2.1.0' },
      }),
    );
    await removeUploadStack(dir);
    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@icore/upload-client']).toBeUndefined();
    expect(pkg.devDependencies?.['@types/multer']).toBeUndefined();
    expect(pkg.dependencies?.['@icore/auth-client']).toBeDefined();
  });
});

describe('removeAuthOnlyPaths + applyAuthNoneVariants + removeAuthTsconfigPaths + removeDockerComposeAuthService', () => {
  let authDir: string;

  beforeEach(async () => {
    authDir = await mkdtemp(join(tmpdir(), 'icore-no-auth-'));

    // Dirs that should be deleted
    await mkdir(join(authDir, 'apps/microservices/auth/src'), { recursive: true });
    await writeFile(join(authDir, 'apps/microservices/auth/src/main.ts'), '');
    await mkdir(join(authDir, 'libs/auth-strategies/supabase'), { recursive: true });
    await writeFile(join(authDir, 'libs/auth-strategies/supabase/index.ts'), '');
    await mkdir(join(authDir, 'libs/auth-client/src'), { recursive: true });
    await writeFile(join(authDir, 'libs/auth-client/src/index.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/auth'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/auth/auth.module.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/profile'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/profile/profile.controller.ts'), '');
    await mkdir(join(authDir, 'apps/api/src/app/abilities'), { recursive: true });
    await writeFile(join(authDir, 'apps/api/src/app/abilities/ability.guard.ts'), '');
    await mkdir(join(authDir, 'libs/shared/src/abilities'), { recursive: true });
    await writeFile(
      join(authDir, 'libs/shared/src/abilities/index.ts'),
      'export function defineAbilitiesFor() {}',
    );
    await mkdir(join(authDir, 'libs/shared/src'), { recursive: true });
    await writeFile(
      join(authDir, 'libs/shared/src/index.ts'),
      "export * from './env';\nexport * from './abilities';\nexport * from './transport';\n",
    );
    await writeFile(
      join(authDir, 'libs/shared/src/client.ts'),
      "export * from './abilities';\nexport * from './types';\n",
    );
    await mkdir(join(authDir, 'apps/client/src/components/auth'), { recursive: true });
    await writeFile(join(authDir, 'apps/client/src/components/auth/LoginForm.tsx'), '');
    await mkdir(join(authDir, 'apps/client/src/routes/_dashboard'), { recursive: true });
    await writeFile(join(authDir, 'apps/client/src/routes/login.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/auth.callback.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/auth.oauth.callback.tsx'), '');
    await writeFile(join(authDir, 'apps/client/src/routes/_dashboard/profile.tsx'), '');
    await writeFile(join(authDir, 'Dockerfile.ms-auth'), '');

    // app.module.ts
    await writeFile(
      join(authDir, 'apps/api/src/app/app.module.ts'),
      [
        "import { AuthModule } from './auth/auth.module';",
        "import { ProfileModule } from './profile/profile.module';",
        "import { AbilitiesModule } from './abilities/abilities.module';",
        "import { FeaturesModule } from './features.module';",
        '@Module({ imports: [AuthModule, ProfileModule, AbilitiesModule, FeaturesModule] })',
        'export class AppModule {}',
      ].join('\n'),
    );

    // _dashboard.tsx
    await writeFile(
      join(authDir, 'apps/client/src/routes/_dashboard.tsx'),
      [
        "import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';",
        "import { useAuthStore } from '@icore/template-shared';",
        "import { MainLayout } from '../layouts/MainLayout';",
        '',
        "export const Route = createFileRoute('/_dashboard')({",
        '  beforeLoad: () => {',
        '    if (!useAuthStore.getState().accessToken) {',
        "      throw redirect({ to: '/login' });",
        '    }',
        '  },',
        '  component: () => (',
        '    <MainLayout>',
        '      <Outlet />',
        '    </MainLayout>',
        '  ),',
        '});',
      ].join('\n'),
    );

    // tsconfig.base.json
    await writeFile(
      join(authDir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/auth-client': ['libs/auth-client/src/index.ts'],
            '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
            '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'],
            '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'],
            '@icore/upload-client': ['libs/upload-client/src/index.ts'],
          },
        },
      }),
    );

    // api package.json
    await writeFile(
      join(authDir, 'apps/api/package.json'),
      JSON.stringify({
        name: 'api',
        dependencies: {
          '@icore/auth-client': '*',
          '@icore/upload-client': '*',
          'cookie-parser': '^1.4.7',
        },
      }),
    );

    // gateway main.ts
    await writeFile(
      join(authDir, 'apps/api/src/main.ts'),
      [
        "import { Logger } from '@nestjs/common';",
        "import { NestFactory } from '@nestjs/core';",
        "import cookieParser from 'cookie-parser';",
        "import { AppModule } from './app/app.module';",
        '',
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule);',
        '  app.use(cookieParser());',
        '}',
      ].join('\n'),
    );

    // gateway .env
    await writeFile(
      join(authDir, 'apps/api/.env'),
      'AUTH_TRANSPORT=tcp\nAUTH_HOST=127.0.0.1\nUPLOAD_TRANSPORT=tcp\n',
    );

    // docker-compose.yml
    await writeFile(
      join(authDir, 'docker-compose.yml'),
      [
        'services:',
        '  auth:',
        '    build:',
        '      context: .',
        '      dockerfile: Dockerfile.ms-auth',
        '    restart: unless-stopped',
        '  gateway:',
        '    environment:',
        '      API_PORT: 3001',
        '      AUTH_TRANSPORT: redis',
        '      AUTH_REDIS_URL: redis://redis:6379',
        '    depends_on:',
        '      redis:',
        '        condition: service_healthy',
        '      auth:',
        '        condition: service_started',
        'networks:',
        '  icore:',
        '    driver: bridge',
      ].join('\n'),
    );

    // routes/index.tsx — CTA points to /login
    await writeFile(
      join(authDir, 'apps/client/src/routes/index.tsx'),
      [
        "import { createFileRoute } from '@tanstack/react-router';",
        "import { LandingPage } from '@icore/template-shared';",
        "export const Route = createFileRoute('/')({",
        '  component: () => (',
        '    <LandingPage',
        '      coreVersion="0.0.0"',
        '      deps={[]}',
        '      ctaHref="/login"',
        '      ctaLabel="Log in →"',
        '    />',
        '  ),',
        '});',
      ].join('\n'),
    );

    // main.tsx — onUnauthorized redirects to /login + AbilityProvider wrapper
    await writeFile(
      join(authDir, 'apps/client/src/main.tsx'),
      [
        'import {',
        '  AbilityProvider,',
        '  createIcoreApi,',
        "} from '@icore/template-shared';",
        'export const api = createIcoreApi({',
        "  baseUrl: '/api',",
        "  onUnauthorized: () => router.navigate({ to: '/login' }),",
        '});',
        'createRoot(document.getElementById("root")!).render(',
        '  <StrictMode>',
        '    <AbilityProvider>',
        '      <App />',
        '    </AbilityProvider>',
        '  </StrictMode>,',
        ');',
      ].join('\n'),
    );

    // template-shared index + abilities dir
    await mkdir(join(authDir, 'libs/template-shared/src/lib/abilities'), { recursive: true });
    await writeFile(
      join(authDir, 'libs/template-shared/src/lib/abilities/ability-provider.tsx'),
      'export function AbilityProvider() { return null; }',
    );
    await writeFile(
      join(authDir, 'libs/template-shared/src/index.ts'),
      [
        "export * from './lib/stores/auth.store.js';",
        "export * from './lib/abilities/ability-provider.js';",
        "export * from './lib/api/create-api.js';",
      ].join('\n'),
    );

    // LayoutHeader.tsx — full auth UI
    await mkdir(join(authDir, 'apps/client/src/components/layout'), { recursive: true });
    await writeFile(
      join(authDir, 'apps/client/src/components/layout/LayoutHeader.tsx'),
      [
        "import { useTranslation } from 'react-i18next';",
        "import { useNavigate } from '@tanstack/react-router';",
        "import { LogOut } from 'lucide-react';",
        "import { useAuthStore, setStoredLocale, type IcoreLocale } from '@icore/template-shared';",
        "import { Button } from '../ui/button';",
        "import { ThemeToggle } from '../ThemeToggle';",
        '',
        'export function LayoutHeader() {',
        '  const { t } = useTranslation();',
        '  const navigate = useNavigate();',
        '  const user = useAuthStore((s) => s.user);',
        '  const logout = useAuthStore((s) => s.logout);',
        '  function handleLocale(code: IcoreLocale) {',
        '    setStoredLocale(code);',
        '  }',
        '  function handleLogout() {',
        '    logout();',
        "    void navigate({ to: '/login' });",
        '  }',
        '',
        '  return (',
        '    <header>',
        '      <div className="flex items-center gap-1">',
        '        <ThemeToggle />',
        '        <div className="hidden sm:flex items-center gap-2 ml-1 pl-2 border-l border-[--color-border]">',
        "          <span>{user?.email ?? ''}</span>",
        '          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t(\'common.logout\')}>',
        '            <LogOut size={15} />',
        '          </Button>',
        '        </div>',
        '        <Button',
        '          variant="ghost"',
        '          size="sm"',
        '          onClick={handleLogout}',
        '          className="sm:hidden cursor-pointer"',
        '        >',
        '          <LogOut size={15} />',
        '        </Button>',
        '      </div>',
        '    </header>',
        '  );',
        '}',
      ].join('\n'),
    );
  });

  it('removeAuthOnlyPaths: removes auth MS, strategy libs, auth-client, and gateway auth dirs', async () => {
    await removeAuthOnlyPaths(authDir);
    await expect(access(join(authDir, 'apps/microservices/auth'))).rejects.toThrow();
    await expect(access(join(authDir, 'libs/auth-strategies'))).rejects.toThrow();
    await expect(access(join(authDir, 'libs/auth-client'))).rejects.toThrow();
    await expect(access(join(authDir, 'apps/api/src/app/auth'))).rejects.toThrow();
    await expect(access(join(authDir, 'apps/api/src/app/profile'))).rejects.toThrow();
    await expect(access(join(authDir, 'apps/api/src/app/abilities'))).rejects.toThrow();
    await expect(access(join(authDir, 'Dockerfile.ms-auth'))).rejects.toThrow();
  });

  it('removeAuthOnlyPaths: removes client auth routes and components', async () => {
    await removeAuthOnlyPaths(authDir);
    await expect(access(join(authDir, 'apps/client/src/components/auth'))).rejects.toThrow();
    await expect(access(join(authDir, 'apps/client/src/routes/login.tsx'))).rejects.toThrow();
    await expect(
      access(join(authDir, 'apps/client/src/routes/auth.callback.tsx')),
    ).rejects.toThrow();
    await expect(
      access(join(authDir, 'apps/client/src/routes/auth.oauth.callback.tsx')),
    ).rejects.toThrow();
    await expect(
      access(join(authDir, 'apps/client/src/routes/_dashboard/profile.tsx')),
    ).rejects.toThrow();
  });

  it('removeAuthOnlyPaths: removes libs/shared/src/abilities and template-shared abilities dir', async () => {
    await removeAuthOnlyPaths(authDir);
    await expect(access(join(authDir, 'libs/shared/src/abilities'))).rejects.toThrow();
    await expect(access(join(authDir, 'libs/template-shared/src/lib/abilities'))).rejects.toThrow();
  });

  it('removeAuthOnlyPaths: strips @icore/auth-client and cookie-parser from api package.json', async () => {
    await removeAuthOnlyPaths(authDir);
    const pkg = JSON.parse(await readFile(join(authDir, 'apps/api/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@icore/auth-client']).toBeUndefined();
    expect(pkg.dependencies['cookie-parser']).toBeUndefined();
    expect(pkg.dependencies['@icore/upload-client']).toBeDefined();
  });

  it('applyAuthNoneVariants: writes app.module.ts without auth modules', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const content = await readFile(join(authDir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(content).not.toContain('AuthModule');
    expect(content).not.toContain('ProfileModule');
    expect(content).not.toContain('AbilitiesModule');
    expect(content).toContain('FeaturesModule');
    expect(content).toContain('StorageModule');
  });

  it('applyAuthNoneVariants: writes _dashboard.tsx without beforeLoad auth guard', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const content = await readFile(join(authDir, 'apps/client/src/routes/_dashboard.tsx'), 'utf8');
    expect(content).not.toContain('beforeLoad');
    expect(content).not.toContain('useAuthStore');
    expect(content).not.toContain('redirect');
    expect(content).toContain('MainLayout');
    expect(content).toContain('Outlet');
  });

  it('applyAuthNoneVariants: writes routes/index.tsx with /dashboard CTA', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const src = await readFile(join(authDir, 'apps/client/src/routes/index.tsx'), 'utf8');
    expect(src).not.toContain('ctaHref="/login"');
    expect(src).toContain('ctaHref="/dashboard"');
    expect(src).toContain('ctaLabel="Dashboard →"');
  });

  it('applyAuthNoneVariants: writes main.tsx without onUnauthorized and AbilityProvider', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const src = await readFile(join(authDir, 'apps/client/src/main.tsx'), 'utf8');
    expect(src).not.toContain('onUnauthorized');
    expect(src).not.toContain('AbilityProvider');
    expect(src).not.toContain('/login');
    expect(src).toContain('createIcoreApi');
  });

  it('applyAuthNoneVariants: writes LayoutHeader.tsx without auth state and logout', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const src = await readFile(
      join(authDir, 'apps/client/src/components/layout/LayoutHeader.tsx'),
      'utf8',
    );
    expect(src).not.toContain('useAuthStore');
    expect(src).not.toContain('handleLogout');
    expect(src).not.toContain('/login');
    expect(src).toContain('setStoredLocale');
    expect(src).toContain('ThemeToggle');
    expect(src).toContain('LayoutHeader');
  });

  it('applyAuthNoneVariants: writes main.ts without cookie-parser', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const src = await readFile(join(authDir, 'apps/api/src/main.ts'), 'utf8');
    expect(src).not.toContain('cookie-parser');
    expect(src).not.toContain('cookieParser');
    expect(src).toContain('AppModule');
    expect(src).toContain('NestFactory');
  });

  it('applyAuthNoneVariants: writes libs/shared/src/index.ts without abilities export', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const idx = await readFile(join(authDir, 'libs/shared/src/index.ts'), 'utf8');
    expect(idx).not.toContain("'./abilities'");
    expect(idx).toContain("'./env'");
    expect(idx).toContain("'./transport'");
  });

  it('applyAuthNoneVariants: writes libs/shared/src/client.ts without abilities export', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const client = await readFile(join(authDir, 'libs/shared/src/client.ts'), 'utf8');
    expect(client).not.toContain("'./abilities'");
    expect(client).toContain("'./types'");
  });

  it('applyAuthNoneVariants: writes template-shared/index.ts without ability-provider export', async () => {
    await applyAuthNoneVariants(authDir, 'shadcn');
    const src = await readFile(join(authDir, 'libs/template-shared/src/index.ts'), 'utf8');
    expect(src).not.toContain('ability-provider');
    expect(src).toContain('auth.store');
    expect(src).toContain('create-api');
  });

  it('removeAuthTsconfigPaths: strips auth tsconfig aliases, keeps unrelated aliases', async () => {
    await removeAuthTsconfigPaths(authDir);
    const ts = JSON.parse(await readFile(join(authDir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(ts.compilerOptions.paths['@icore/auth-client']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-supabase']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-firebase']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-mongodb']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/upload-client']).toBeDefined();
  });

  it('removeDockerComposeAuthService: strips auth service and gateway auth deps from docker-compose.yml', async () => {
    await removeDockerComposeAuthService(authDir);
    const compose = await readFile(join(authDir, 'docker-compose.yml'), 'utf8');
    expect(compose).not.toContain('Dockerfile.ms-auth');
    expect(compose).not.toContain('AUTH_TRANSPORT');
    expect(compose).not.toContain('AUTH_REDIS_URL');
    expect(compose).toContain('gateway:');
    const gatewaySection = compose.slice(compose.indexOf('  gateway:'));
    expect(gatewaySection).not.toContain('auth:');
  });
});

describe('removeStrategiesLib', () => {
  let stratDir: string;

  beforeEach(async () => {
    stratDir = await mkdtemp(join(tmpdir(), 'icore-no-strat-'));
    await mkdir(join(stratDir, 'libs/shared/src/strategies/fakes'), { recursive: true });
    await writeFile(
      join(stratDir, 'libs/shared/src/strategies/auth.ts'),
      'export interface AuthStrategy {}',
    );
    await writeFile(join(stratDir, 'libs/shared/src/strategies/fakes/fake-auth.ts'), '');
    await writeFile(join(stratDir, 'libs/shared/src/testing.ts'), 'export const test = 1;');
    await writeFile(
      join(stratDir, 'libs/shared/src/transport.ts'),
      "import { Transport } from '@nestjs/microservices'; export function buildTransport() {}",
    );
    await writeFile(
      join(stratDir, 'libs/shared/src/index.ts'),
      [
        "export * from './env';",
        "export * from './strategies';",
        "export * from './transport';",
      ].join('\n'),
    );
    await writeFile(
      join(stratDir, 'libs/shared/package.json'),
      JSON.stringify({
        name: '@icore/shared',
        exports: {
          '.': { default: './src/index.ts' },
          './client': { default: './src/client.ts' },
          './testing': { default: './src/testing.ts' },
        },
        dependencies: { '@nestjs/microservices': '^11.0.0', tslib: '^2.3.0' },
      }),
    );
  });

  it('removes libs/shared/src/strategies dir, testing.ts, and transport.ts', async () => {
    await removeStrategiesLib(stratDir);
    await expect(access(join(stratDir, 'libs/shared/src/strategies'))).rejects.toThrow();
    await expect(access(join(stratDir, 'libs/shared/src/testing.ts'))).rejects.toThrow();
    await expect(access(join(stratDir, 'libs/shared/src/transport.ts'))).rejects.toThrow();
  });

  it('strips strategies and transport re-exports from index.ts, keeps others', async () => {
    await removeStrategiesLib(stratDir);
    const src = await readFile(join(stratDir, 'libs/shared/src/index.ts'), 'utf8');
    expect(src).not.toContain("'./strategies'");
    expect(src).not.toContain("'./transport'");
    expect(src).toContain("'./env'");
  });

  it('removes ./testing export and @nestjs/microservices from package.json', async () => {
    await removeStrategiesLib(stratDir);
    const pkg = JSON.parse(await readFile(join(stratDir, 'libs/shared/package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      dependencies: Record<string, string>;
    };
    expect(pkg.exports['./testing']).toBeUndefined();
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['./client']).toBeDefined();
    expect(pkg.dependencies['@nestjs/microservices']).toBeUndefined();
    expect(pkg.dependencies['tslib']).toBeDefined();
  });
});

describe('removeFirebaseAdminLib', () => {
  let fbDir: string;

  beforeEach(async () => {
    fbDir = await mkdtemp(join(tmpdir(), 'icore-no-fb-'));

    await mkdir(join(fbDir, 'libs/firebase-admin/src'), { recursive: true });
    await writeFile(join(fbDir, 'libs/firebase-admin/src/index.ts'), 'export {};');

    await writeFile(
      join(fbDir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/firebase-admin': ['libs/firebase-admin/src/index.ts'],
            '@icore/shared': ['libs/shared/src/index.ts'],
          },
        },
      }),
    );

    for (const ms of ['auth', 'upload', 'notes']) {
      await mkdir(join(fbDir, `apps/microservices/${ms}`), { recursive: true });
      await writeFile(
        join(fbDir, `apps/microservices/${ms}/package.json`),
        JSON.stringify({
          name: ms,
          dependencies: { '@icore/firebase-admin': '*', tslib: '^2.0.0' },
        }),
      );
    }
  });

  it('deletes libs/firebase-admin directory', async () => {
    await removeFirebaseAdminLib(fbDir);
    await expect(access(join(fbDir, 'libs/firebase-admin'))).rejects.toThrow();
  });

  it('removes @icore/firebase-admin tsconfig alias', async () => {
    await removeFirebaseAdminLib(fbDir);
    const tsconfig = JSON.parse(await readFile(join(fbDir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(tsconfig.compilerOptions.paths['@icore/firebase-admin']).toBeUndefined();
    expect(tsconfig.compilerOptions.paths['@icore/shared']).toBeDefined();
  });

  it('removes @icore/firebase-admin dep from all three MS package.json files', async () => {
    await removeFirebaseAdminLib(fbDir);
    for (const ms of ['auth', 'upload', 'notes']) {
      const pkg = JSON.parse(
        await readFile(join(fbDir, `apps/microservices/${ms}/package.json`), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      expect(pkg.dependencies?.['@icore/firebase-admin']).toBeUndefined();
      expect(pkg.dependencies?.['tslib']).toBeDefined();
    }
  });
});

describe('rewriteRootPackageJson — workspace glob and dep pruning', () => {
  async function run(opts: Partial<CreateIcoreOptions>) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'icore',
        version: '1.0.0',
        workspaces: [
          'apps/*',
          'apps/microservices/*',
          'apps/templates/*',
          'libs/*',
          'libs/auth-strategies/*',
          'libs/storage-strategies/*',
          'libs/db-strategies/*',
        ],
        dependencies: {
          'cookie-parser': '^1.4.7',
          axios: '^1.6.0',
          '@nestjs/microservices': '^11.0.0',
        },
        devDependencies: { '@types/cookie-parser': '^1.4.10', '@types/multer': '^2.1.0' },
      }),
    );
    await rewriteRootPackageJson(dir, { ...baseOpts, targetDir: dir, ...opts });
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      workspaces: string[];
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
  }

  it('removes apps/templates/* and dead strategy globs for all-none', async () => {
    const pkg = await run({
      authProvider: 'none',
      upload: 'none',
      dbProvider: 'none',
      payment: 'none',
      jobs: 'none',
      example: 'none',
    });
    expect(pkg.workspaces).not.toContain('apps/templates/*');
    expect(pkg.workspaces).not.toContain('apps/microservices/*');
    expect(pkg.workspaces).not.toContain('libs/auth-strategies/*');
    expect(pkg.workspaces).not.toContain('libs/storage-strategies/*');
    expect(pkg.workspaces).not.toContain('libs/db-strategies/*');
    expect(pkg.workspaces).toContain('apps/*');
    expect(pkg.workspaces).toContain('libs/*');
    expect(pkg.dependencies['@nestjs/microservices']).toBeUndefined();
    expect(pkg.dependencies['axios']).toBeDefined();
  });

  it('keeps apps/microservices/* when any MS is active', async () => {
    const pkg = await run({ authProvider: 'supabase', upload: 'none', dbProvider: 'none' });
    expect(pkg.workspaces).toContain('apps/microservices/*');
    expect(pkg.workspaces).toContain('libs/auth-strategies/*');
    expect(pkg.workspaces).not.toContain('libs/storage-strategies/*');
  });

  it('removes cookie-parser and @types/cookie-parser when auth=none', async () => {
    const pkg = await run({ authProvider: 'none' });
    expect(pkg.dependencies['cookie-parser']).toBeUndefined();
    expect(pkg.devDependencies['@types/cookie-parser']).toBeUndefined();
    expect(pkg.dependencies['axios']).toBeDefined();
  });

  it('removes @types/multer when upload=none', async () => {
    const pkg = await run({ upload: 'none' });
    expect(pkg.devDependencies['@types/multer']).toBeUndefined();
  });

  it('keeps all deps when providers are active', async () => {
    const pkg = await run({ authProvider: 'supabase', upload: 'cloudinary' });
    expect(pkg.dependencies['cookie-parser']).toBeDefined();
    expect(pkg.devDependencies['@types/cookie-parser']).toBeDefined();
    expect(pkg.devDependencies['@types/multer']).toBeDefined();
  });
});

describe('rewriteRootPackageJson — broker transport driver deps', () => {
  async function run(transport: CreateIcoreOptions['transport']) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'icore', version: '1.0.0', dependencies: { ioredis: '^5.11.0' } }),
    );
    await rewriteRootPackageJson(dir, { ...baseOpts, targetDir: dir, transport });
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
  }

  it('adds the matching driver dep per broker transport (optional peer deps)', async () => {
    expect((await run('nats')).dependencies?.['nats']).toBeDefined();
    expect((await run('mqtt')).dependencies?.['mqtt']).toBeDefined();
    const rmq = (await run('rmq')).dependencies ?? {};
    expect(rmq['amqplib']).toBeDefined();
    expect(rmq['amqp-connection-manager']).toBeDefined();
    expect((await run('kafka')).dependencies?.['kafkajs']).toBeDefined();
  });

  it('adds no broker driver for tcp or redis (redis ships via the jobs stack)', async () => {
    for (const t of ['tcp', 'redis'] as const) {
      const deps = (await run(t)).dependencies ?? {};
      expect(deps['nats']).toBeUndefined();
      expect(deps['mqtt']).toBeUndefined();
      expect(deps['amqplib']).toBeUndefined();
      expect(deps['kafkajs']).toBeUndefined();
    }
  });
});

describe('api package dependencies', () => {
  it('keeps Express compatible with the payment peer dependency', async () => {
    const apiPkg = JSON.parse(await readFile(join(repoRoot, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(apiPkg.dependencies?.['@idevconn/payment']).toBe('^1.2.0');
    expect(apiPkg.dependencies?.['express']).toMatch(/^\^5\./);
    expect(apiPkg.devDependencies?.['@types/express']).toMatch(/^\^5\./);
  });
});

describe('pruneRootProviderDeps — prune unchosen provider SDKs from root package.json', () => {
  // Fixture root package.json: all 4 marker SDKs + a transport driver + non-marker deps.
  async function run(opts: Partial<CreateIcoreOptions>) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'icore',
        version: '1.0.0',
        dependencies: {
          '@supabase/supabase-js': '^2.106.2',
          cloudinary: '^2.10.0',
          mongoose: '^9.6.3',
          'firebase-admin': '^13.0.0',
          // non-marker deps that must always survive
          nats: '^2.29.3',
          '@nestjs/mongoose': '^11.0.4',
          bcrypt: '^6.0.0',
          jsonwebtoken: '^9.0.3',
        },
      }),
    );
    await pruneRootProviderDeps(dir, { ...baseOpts, targetDir: dir, ...opts });
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    return pkg.dependencies ?? {};
  }

  it('removes unchosen SDKs while keeping chosen ones (supabase-only project)', async () => {
    const deps = await run({
      authProvider: 'supabase',
      dbProvider: 'supabase',
      upload: 'supabase',
    });
    // chosen → kept
    expect(deps['@supabase/supabase-js']).toBeDefined();
    // unchosen → removed
    expect(deps['cloudinary']).toBeUndefined();
    expect(deps['mongoose']).toBeUndefined();
    expect(deps['firebase-admin']).toBeUndefined();
  });

  it('removes supabase + cloudinary + firebase for a mongodb-only project, keeps mongoose', async () => {
    const deps = await run({
      authProvider: 'mongodb',
      dbProvider: 'mongodb',
      upload: 'mongodb',
    });
    expect(deps['mongoose']).toBeDefined();
    expect(deps['@supabase/supabase-js']).toBeUndefined();
    expect(deps['cloudinary']).toBeUndefined();
    expect(deps['firebase-admin']).toBeUndefined();
  });

  it('keeps cloudinary when upload=cloudinary even on a supabase auth/db project', async () => {
    const deps = await run({
      authProvider: 'supabase',
      dbProvider: 'firebase',
      upload: 'cloudinary',
    });
    expect(deps['cloudinary']).toBeDefined();
    expect(deps['@supabase/supabase-js']).toBeDefined();
    expect(deps['firebase-admin']).toBeDefined();
    expect(deps['mongoose']).toBeUndefined();
  });

  it('never touches transport driver deps or @nestjs/mongoose/bcrypt/jsonwebtoken', async () => {
    const deps = await run({
      authProvider: 'firebase',
      dbProvider: 'firebase',
      upload: 'none',
    });
    expect(deps['nats']).toBeDefined();
    expect(deps['@nestjs/mongoose']).toBeDefined();
    expect(deps['bcrypt']).toBeDefined();
    expect(deps['jsonwebtoken']).toBeDefined();
    // firebase chosen → kept; the rest pruned
    expect(deps['firebase-admin']).toBeDefined();
    expect(deps['@supabase/supabase-js']).toBeUndefined();
    expect(deps['cloudinary']).toBeUndefined();
    expect(deps['mongoose']).toBeUndefined();
  });
});

describe('writeAuthEnv — broker transport env', () => {
  it('uncomments the matching broker vars for mqtt/rmq/kafka', async () => {
    for (const [transport, expected] of [
      ['mqtt', 'AUTH_MQTT_URL=mqtt://localhost:1883'],
      ['rmq', 'AUTH_RMQ_QUEUE=auth_queue'],
      ['kafka', 'AUTH_KAFKA_BROKERS=localhost:9092'],
    ] as const) {
      await writeFile(
        join(dir, 'apps/microservices/auth/.env.example'),
        [
          'AUTH_TRANSPORT=tcp',
          'AUTH_PROVIDER=supabase',
          '# AUTH_MQTT_URL=mqtt://localhost:1883',
          '# AUTH_RMQ_URL=amqp://localhost:5672',
          '# AUTH_RMQ_QUEUE=auth_queue',
          '# AUTH_KAFKA_BROKERS=localhost:9092',
          '# AUTH_KAFKA_CLIENT_ID=auth',
        ].join('\n'),
      );
      await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, transport });
      const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
      expect(env).toContain(`AUTH_TRANSPORT=${transport}`);
      expect(env).toContain(expected);
      expect(env).not.toContain(`# ${expected}`);
    }
  });

  it('appends MONGODB_URI and JWT_SECRET when authProvider=mongodb', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'mongodb' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('MONGODB_URI=mongodb://localhost:27017/icore-auth');
    expect(env).toContain('JWT_SECRET=change-me-in-production');
  });

  it('does not append MONGODB_URI when authProvider is not mongodb', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'supabase' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).not.toContain('MONGODB_URI');
    expect(env).not.toContain('JWT_SECRET');
  });
});

describe('writeUploadEnv — mongodb', () => {
  it('appends MONGODB_URI when upload=mongodb', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'mongodb' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).toContain('MONGODB_URI=mongodb://localhost:27017/icore-upload');
  });

  it('does not append MONGODB_URI when upload is not mongodb', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'cloudinary' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).not.toContain('MONGODB_URI');
  });
});

describe('rewriteRootPackageJson — mongodb deps', () => {
  async function run(opts: Partial<CreateIcoreOptions>) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'icore',
        version: '1.0.0',
        dependencies: { axios: '^1.6.0' },
        devDependencies: {},
      }),
    );
    await rewriteRootPackageJson(dir, { ...baseOpts, targetDir: dir, ...opts });
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
  }

  it('adds mongoose and @nestjs/mongoose when authProvider=mongodb', async () => {
    const pkg = await run({ authProvider: 'mongodb', dbProvider: 'none', upload: 'none' });
    expect(pkg.dependencies['mongoose']).toBeDefined();
    expect(pkg.dependencies['@nestjs/mongoose']).toBeDefined();
  });

  it('adds @types/bcrypt and @types/jsonwebtoken to devDeps when authProvider=mongodb', async () => {
    const pkg = await run({ authProvider: 'mongodb', dbProvider: 'none', upload: 'none' });
    expect(pkg.devDependencies['@types/bcrypt']).toBeDefined();
    expect(pkg.devDependencies['@types/jsonwebtoken']).toBeDefined();
  });

  it('adds mongoose when only upload=mongodb (no auth mongodb)', async () => {
    const pkg = await run({ authProvider: 'supabase', dbProvider: 'supabase', upload: 'mongodb' });
    expect(pkg.dependencies['mongoose']).toBeDefined();
    expect(pkg.dependencies['@nestjs/mongoose']).toBeDefined();
    expect(pkg.devDependencies['@types/bcrypt']).toBeUndefined();
    expect(pkg.devDependencies['@types/jsonwebtoken']).toBeUndefined();
  });

  it('adds mongoose when dbProvider=mongodb even if auth and upload are not mongodb', async () => {
    const pkg = await run({
      authProvider: 'supabase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
    });
    expect(pkg.dependencies['mongoose']).toBeDefined();
    expect(pkg.dependencies['@nestjs/mongoose']).toBeDefined();
    expect(pkg.devDependencies['@types/bcrypt']).toBeUndefined();
  });

  it('does not add mongoose when no provider is mongodb', async () => {
    const pkg = await run({
      authProvider: 'supabase',
      dbProvider: 'supabase',
      upload: 'cloudinary',
    });
    expect(pkg.dependencies['mongoose']).toBeUndefined();
    expect(pkg.dependencies['@nestjs/mongoose']).toBeUndefined();
    expect(pkg.devDependencies['@types/bcrypt']).toBeUndefined();
  });
});
