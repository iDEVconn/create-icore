import type { Plugin } from 'vite';
import type { UserConfig } from 'vitest/config';

export declare function noServerModulesPlugin(): Plugin;

export declare function injectAppVersionPlugin(pkg: { version: string }): Plugin;

export declare function commonDefines(pkg: {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Record<string, string>;

export declare function commonManualChunks(
  uiChunkFn?: (id: string) => string | undefined,
): (id: string) => string | undefined;

export declare function commonTestConfig(
  name: string,
  coverageDir: string,
): NonNullable<UserConfig['test']>;
