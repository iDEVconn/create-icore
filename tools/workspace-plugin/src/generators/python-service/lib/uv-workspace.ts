import type { Tree } from '@nx/devkit';
import type { PythonServiceFramework } from '../schema';

/**
 * Ensures that the root pyproject.toml exists and registers memberPath in
 * [tool.uv.workspace] members = [...].
 */
export function ensureUvWorkspaceMember(tree: Tree, memberPath: string): void {
  const rootPyproject = 'pyproject.toml';

  if (!tree.exists(rootPyproject)) {
    const content = [
      '[project]',
      'name = "workspace-root"',
      'version = "0.1.0"',
      'requires-python = ">=3.12"',
      'dependencies = []',
      '',
      '[tool.uv.workspace]',
      'members = [',
      `  "${memberPath}",`,
      ']',
      '',
    ].join('\n');
    tree.write(rootPyproject, content);
    return;
  }

  const content = tree.read(rootPyproject, 'utf-8') ?? '';

  if (content.includes(`"${memberPath}"`) || content.includes(`'${memberPath}'`)) {
    return;
  }

  const workspaceMatch = content.match(/\[tool\.uv\.workspace\][^[]*/m);

  if (!workspaceMatch) {
    const toAppend = ['', '[tool.uv.workspace]', 'members = [', `  "${memberPath}",`, ']', ''].join(
      '\n',
    );
    const trimmed = content.trimEnd();
    tree.write(rootPyproject, `${trimmed}\n${toAppend}`);
    return;
  }

  const workspaceSection = workspaceMatch[0];
  const membersMatch = workspaceSection.match(/members\s*=\s*\[([^\]]*)\]/m);

  if (membersMatch) {
    const rawMembers = membersMatch[1] ?? '';
    const newMembers = `${rawMembers.trimEnd()}${rawMembers.trim() ? '\n' : ''}  "${memberPath}",\n`;
    const updatedSection = workspaceSection.replace(
      membersMatch[0],
      `members = [\n${newMembers.trimEnd()}\n]`,
    );
    const updatedContent = content.replace(workspaceSection, updatedSection);
    tree.write(rootPyproject, updatedContent);
  } else {
    const updatedSection = `${workspaceSection.trimEnd()}\nmembers = [\n  "${memberPath}",\n]\n`;
    const updatedContent = content.replace(workspaceSection, updatedSection);
    tree.write(rootPyproject, updatedContent);
  }
}

/**
 * Appends HTTP/gRPC gateway connection settings to apps/api/.env.example and apps/api/.env.
 */
export function appendPythonGatewayEnvBlock(
  tree: Tree,
  opts: {
    fileName: string;
    className: string;
    constantName: string;
    framework: PythonServiceFramework;
    port: number;
  },
): void {
  const transport = opts.framework === 'fastapi' ? 'http' : 'grpc';
  const url =
    opts.framework === 'fastapi' ? `http://127.0.0.1:${opts.port}` : `127.0.0.1:${opts.port}`;

  const block = [
    '',
    `# ${opts.className} Python MS (${opts.framework}) — must match apps/microservices/${opts.fileName}/.env`,
    `${opts.constantName}_TRANSPORT=${transport}`,
    `${opts.constantName}_HOST=127.0.0.1`,
    `${opts.constantName}_PORT=${opts.port}`,
    `${opts.constantName}_URL=${url}`,
    '',
  ].join('\n');

  for (const envPath of ['apps/api/.env.example', 'apps/api/.env']) {
    if (!tree.exists(envPath)) continue;
    const current = tree.read(envPath, 'utf-8') ?? '';
    if (current.includes(`${opts.constantName}_URL=`)) continue;
    const trimmed = current.trimEnd();
    tree.write(envPath, `${trimmed}\n${block}`);
  }
}
