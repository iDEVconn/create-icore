import { join } from 'node:path';
import { formatFiles, generateFiles, names, updateJson, type Tree } from '@nx/devkit';
import type { PythonServiceGeneratorSchema } from './schema';
import { appendPythonGatewayEnvBlock, ensureUvWorkspaceMember } from './lib/uv-workspace';
import {
  injectIntoFeaturesModule,
  injectIntoGatewayServices,
} from '../microservice/lib/ast-wiring';
import { detectNextTcpPort } from '../microservice/lib/workspace-inspect';

const RESERVED_NAMES = new Set(['api', 'client', 'shared', 'workspace-plugin', 'create-icore']);

export async function pythonServiceGenerator(
  tree: Tree,
  options: PythonServiceGeneratorSchema,
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
  const pythonModuleName = fileName.replace(/-/g, '_'); // snake_case, e.g. "service_one"

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

  const framework = options.framework ?? 'fastapi';
  const port = options.port ?? detectNextTcpPort(tree);
  const uvWorkspace = options.uvWorkspace ?? true;
  const skipBff = options.skipBff ?? false;

  const isPnpm = tree.exists('pnpm-workspace.yaml');
  const workspaceDepVersion = isPnpm ? 'workspace:*' : '*';

  const extraTags = (options.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const msTags = Array.from(
    new Set(['type:microservice', 'lang:python', `scope:${fileName}`, ...extraTags]),
  );
  const clientTags = Array.from(new Set(['type:client-lib', `scope:${fileName}`, ...extraTags]));

  const templateVars = {
    ...normalized,
    fileName,
    className,
    propertyName,
    constantName,
    pythonModuleName,
    framework,
    port,
    workspaceDepVersion,
    msTagsJson: JSON.stringify(msTags),
    clientTagsJson: JSON.stringify(clientTags),
    tmpl: '',
  };

  // 1. Scaffold apps/microservices/<name> common files
  generateFiles(tree, join(__dirname, 'files/service'), msRoot, templateVars);

  // 2. Scaffold framework-specific files (fastapi or grpc)
  if (framework === 'fastapi') {
    generateFiles(tree, join(__dirname, 'files/fastapi-service'), msRoot, templateVars);
  } else {
    generateFiles(tree, join(__dirname, 'files/grpc-service'), msRoot, templateVars);
  }

  // Write .env from .env.example
  const msEnvExample = tree.read(`${msRoot}/.env.example`, 'utf-8') ?? '';
  tree.write(`${msRoot}/.env`, msEnvExample);

  // 3. Register in root pyproject.toml if uvWorkspace is enabled
  if (uvWorkspace) {
    ensureUvWorkspaceMember(tree, msRoot);
  }

  // 4. Scaffold libs/<name>-client + apps/api BFF wiring (unless --skipBff)
  if (!skipBff) {
    const clientRoot = `libs/${fileName}-client`;
    generateFiles(tree, join(__dirname, 'files/client-lib-common'), clientRoot, templateVars);

    if (framework === 'fastapi') {
      generateFiles(tree, join(__dirname, 'files/client-lib-fastapi'), clientRoot, templateVars);
    } else {
      generateFiles(tree, join(__dirname, 'files/client-lib-grpc'), clientRoot, templateVars);
    }

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
    appendPythonGatewayEnvBlock(tree, {
      fileName,
      className,
      constantName,
      framework,
      port,
    });
  }

  await formatFiles(tree);
}

export default pythonServiceGenerator;
