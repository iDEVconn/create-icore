export interface SQLitePragmas {
  journal_mode?: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF';
  busy_timeout?: number;
  foreign_keys?: 'ON' | 'OFF';
  synchronous?: 'NORMAL' | 'FULL' | 'EXTRA' | 'OFF';
  cache_size?: number;
  temp_store?: 'MEMORY' | 'FILE' | 'DEFAULT';
  [key: string]: string | number | boolean | undefined;
}

export interface SQLiteConfig {
  databasePath: string;
  wal: boolean;
  busyTimeout: number;
  pragmas: SQLitePragmas;
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
}

export const DEFAULT_SQLITE_CONFIG: SQLiteConfig = {
  databasePath: './sqlite/app.db',
  wal: true,
  busyTimeout: 5000,
  pragmas: {
    journal_mode: 'WAL',
    busy_timeout: 5000,
    foreign_keys: 'ON',
    synchronous: 'NORMAL',
    cache_size: -20000, // ~20MB cache
    temp_store: 'MEMORY',
  },
};

export function validateSqliteConfig(raw: Partial<SQLiteConfig> = {}): SQLiteConfig {
  const databasePath = raw.databasePath?.trim() || DEFAULT_SQLITE_CONFIG.databasePath;
  const wal = raw.wal ?? DEFAULT_SQLITE_CONFIG.wal;
  const busyTimeout =
    typeof raw.busyTimeout === 'number' && raw.busyTimeout >= 0
      ? raw.busyTimeout
      : DEFAULT_SQLITE_CONFIG.busyTimeout;

  const pragmas: SQLitePragmas = {
    ...DEFAULT_SQLITE_CONFIG.pragmas,
    ...(raw.pragmas ?? {}),
    journal_mode: wal ? 'WAL' : (raw.pragmas?.journal_mode ?? 'DELETE'),
    busy_timeout: busyTimeout,
  };

  return {
    databasePath,
    wal,
    busyTimeout,
    pragmas,
    verbose: raw.verbose,
  };
}

export function parseSqliteEnv(getter: (key: string) => string | undefined): SQLiteConfig {
  const databasePath = getter('SQLITE_DB_PATH') || DEFAULT_SQLITE_CONFIG.databasePath;
  const wal = getter('SQLITE_WAL') !== 'false';
  const busyTimeoutStr = getter('SQLITE_BUSY_TIMEOUT');
  const busyTimeout = busyTimeoutStr
    ? parseInt(busyTimeoutStr, 10)
    : DEFAULT_SQLITE_CONFIG.busyTimeout;

  const customSync = getter('SQLITE_PRAGMA_SYNCHRONOUS');
  const pragmas: SQLitePragmas = {
    ...DEFAULT_SQLITE_CONFIG.pragmas,
    ...(customSync ? { synchronous: customSync as SQLitePragmas['synchronous'] } : {}),
  };

  return validateSqliteConfig({
    databasePath,
    wal,
    busyTimeout,
    pragmas,
  });
}
