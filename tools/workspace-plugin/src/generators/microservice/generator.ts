import { join } from 'node:path';
import { formatFiles, generateFiles, names, updateJson, type Tree } from '@nx/devkit';
import type { MicroserviceGeneratorSchema } from './schema';
import { injectIntoFeaturesModule, injectIntoGatewayServices } from './lib/ast-wiring';
import {
  appendGatewayEnvBlock,
  detectDbProvider,
  detectNextInspectPort,
  detectNextTcpPort,
  detectWorkspaceTransport,
  uncommentBrokerEnvLines,
} from './lib/workspace-inspect';

const RESERVED_NAMES = new Set(['api', 'client', 'shared', 'workspace-plugin', 'create-icore']);

export async function microserviceGenerator(
  tree: Tree,
  options: MicroserviceGeneratorSchema,
): Promise<void> {
  const rawName = options.name?.trim() ?? '';
  if (!rawName) {
    throw new Error('Microservice name is required.');
  }

  const normalized = names(rawName);
  const fileName = normalized.fileName; // kebab-case, e.g. "service-one"
  const className = normalized.className; // PascalCase, e.g. "ServiceOne"
  const propertyName = normalized.propertyName; // camelCase, e.g. "serviceOne"
  const constantName = normalized.constantName; // SCREAMING_SNAKE_CASE, e.g. "SERVICE_ONE"

  if (!/^[a-z][a-z0-9-]*$/.test(fileName)) {
    throw new Error(
      `Invalid microservice name "${options.name}". Expected kebab-case starting with a letter.`,
    );
  }
  if (RESERVED_NAMES.has(fileName)) {
    throw new Error(`"${fileName}" is a reserved project name in the iCore monorepo.`);
  }

  const msRoot = `apps/microservices/${fileName}`;
  if (tree.exists(`${msRoot}/project.json`)) {
    throw new Error(`Microservice "${fileName}" already exists at ${msRoot}.`);
  }

  const transport = options.transport ?? detectWorkspaceTransport(tree);
  const port = options.port ?? detectNextTcpPort(tree);
  const inspectPort = options.inspectPort ?? detectNextInspectPort(tree);
  const skipBff = options.skipBff ?? false;
  const withDb = options.withDb ?? false;
  const withDocker = options.withDocker ?? false;
  const dbInfo = detectDbProvider(tree);
  const isPnpm = tree.exists('pnpm-workspace.yaml');
  const workspaceDepVersion = isPnpm ? 'workspace:*' : '*';

  const extraTags = (options.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const msTags = Array.from(new Set([`type:microservice`, `scope:${fileName}`, ...extraTags]));
  const clientTags = Array.from(new Set([`type:client-lib`, `scope:${fileName}`, ...extraTags]));

  const templateVars = {
    ...normalized,
    fileName,
    className,
    propertyName,
    constantName,
    queueName: `${fileName.replace(/-/g, '_')}_queue`,
    transport,
    port,
    inspectPort,
    withDb,
    dbImportPath: dbInfo.importPath,
    dbModuleSymbol: dbInfo.moduleSymbol,
    dbProviderName: dbInfo.providerName,
    workspaceDepVersion,
    msTagsJson: JSON.stringify(msTags),
    clientTagsJson: JSON.stringify(clientTags),
    tmpl: '',
  };

  // 1. Scaffold apps/microservices/<name>
  generateFiles(tree, join(__dirname, 'files/microservice'), msRoot, templateVars);
  if (!withDb) {
    tree.delete(`${msRoot}/src/app/db.provider.ts`);
  } else {
    updateJson(tree, `${msRoot}/package.json`, (pkg) => {
      pkg.dependencies ??= {};
      for (const [dep, ver] of Object.entries(dbInfo.extraDeps)) {
        pkg.dependencies[dep] = ver === '*' ? workspaceDepVersion : ver;
      }
      return pkg;
    });
  }

  // Write .env from .env.example with active broker lines uncommented
  const msEnvExamplePath = `${msRoot}/.env.example`;
  const msEnvExample = tree.read(msEnvExamplePath, 'utf-8') ?? '';
  const processedMsEnv = uncommentBrokerEnvLines(msEnvExample, constantName, transport);
  tree.write(msEnvExamplePath, processedMsEnv);
  tree.write(`${msRoot}/.env`, processedMsEnv);

  // 2. Optional Dockerfile.ms-<name>
  if (withDocker) {
    generateFiles(tree, join(__dirname, 'files/docker'), '.', templateVars);
  }

  // 3. Scaffold libs/<name>-client + apps/api BFF wiring (unless --skipBff)
  if (!skipBff) {
    const clientRoot = `libs/${fileName}-client`;
    generateFiles(tree, join(__dirname, 'files/client-lib'), clientRoot, templateVars);

    const gatewayModuleRoot = `apps/api/src/app/${fileName}`;
    generateFiles(tree, join(__dirname, 'files/gateway-feature'), gatewayModuleRoot, templateVars);

    // Update tsconfig.base.json paths
    const clientAlias = `@icore/${fileName}-client`;
    if (tree.exists('tsconfig.base.json')) {
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions ??= {};
        json.compilerOptions.paths ??= {};
        json.compilerOptions.paths[clientAlias] = [`./libs/${fileName}-client/src/index.ts`];
        return json;
      });
    }

    // Update apps/api/package.json dependencies
    if (tree.exists('apps/api/package.json')) {
      updateJson(tree, 'apps/api/package.json', (pkg) => {
        pkg.dependencies ??= {};
        pkg.dependencies[clientAlias] = workspaceDepVersion;
        return pkg;
      });
    }

    // AST-inject into apps/api/src/app/features.module.ts and gateway-services.ts
    injectIntoFeaturesModule(tree, { fileName, className });
    injectIntoGatewayServices(tree, { fileName, constantName });

    // Append transport block to apps/api/.env.example and apps/api/.env
    appendGatewayEnvBlock(tree, {
      fileName,
      className,
      constantName,
      transport,
      port,
    });
  }

  await formatFiles(tree);
}

export default microserviceGenerator;
