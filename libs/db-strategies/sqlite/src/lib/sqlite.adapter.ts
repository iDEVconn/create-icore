export interface GeneratorContext {
  projectName: string;
  targetDir: string;
  env?: Record<string, string>;
}

export interface ContainerVolumeBinding {
  namedVolume: string;
  containerPath: string;
  hostPath: string;
}

export interface IDatabaseAdapter {
  getProviderName(): string;
  getDependencies(): Record<string, string>;
  getDevDependencies(): Record<string, string>;
  getEnvironmentVariables(context: GeneratorContext): Record<string, string>;
  getClientBoilerplate(envPath: string): string;
  getSchemaDDL(): string;
  getContainerVolumeBindings(): ContainerVolumeBinding[];
}

export class SQLiteAdapter implements IDatabaseAdapter {
  getProviderName(): string {
    return 'sqlite';
  }

  getDependencies(): Record<string, string> {
    return {
      'better-sqlite3': '^11.8.1',
    };
  }

  getDevDependencies(): Record<string, string> {
    return {
      '@types/better-sqlite3': '^7.6.12',
    };
  }

  getEnvironmentVariables(_context: GeneratorContext): Record<string, string> {
    return {
      SQLITE_DB_PATH: './sqlite/app.db',
      SQLITE_WAL: 'true',
      SQLITE_BUSY_TIMEOUT: '5000',
      SQLITE_PRAGMA_SYNCHRONOUS: 'NORMAL',
    };
  }

  getClientBoilerplate(envPath: string): string {
    return (
      `import { SqliteDbModule } from '@icore/db-sqlite';\n\n` +
      `const ENV_PATH = '${envPath}';\n\n` +
      `export const DbProviderModule = SqliteDbModule.forRoot(ENV_PATH);\n`
    );
  }

  getSchemaDDL(): string {
    return (
      `-- SQLite Document Store Schema\n` +
      `CREATE TABLE IF NOT EXISTS notes (\n` +
      `  id TEXT PRIMARY KEY,\n` +
      `  data TEXT NOT NULL\n` +
      `);\n` +
      `CREATE INDEX IF NOT EXISTS notes_id_idx ON notes (id);\n`
    );
  }

  getContainerVolumeBindings(): ContainerVolumeBinding[] {
    return [
      {
        namedVolume: 'icore_sqlite_data',
        containerPath: '/app/sqlite',
        hostPath: './sqlite',
      },
    ];
  }
}
