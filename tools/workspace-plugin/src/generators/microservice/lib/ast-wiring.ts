import * as ts from 'typescript';
import type { Tree } from '@nx/devkit';

export const FEATURES_MODULE_PATH = 'apps/api/src/app/features.module.ts';
export const GATEWAY_SERVICES_PATH = 'apps/api/src/app/gateway-services.ts';

/**
 * Safely injects `import { <ClassName>Module } from './<fileName>/<fileName>.module';`
 * and adds `<ClassName>Module` to the `@Module({ imports: [...] })` array in
 * `apps/api/src/app/features.module.ts` using the TypeScript AST.
 */
export function injectIntoFeaturesModule(
  tree: Tree,
  opts: { fileName: string; className: string },
): void {
  if (!tree.exists(FEATURES_MODULE_PATH)) return;
  const content = tree.read(FEATURES_MODULE_PATH, 'utf-8');
  if (!content) return;

  const moduleSymbol = `${opts.className}Module`;
  const importPath = `./${opts.fileName}/${opts.fileName}.module`;

  const sourceFile = ts.createSourceFile(
    FEATURES_MODULE_PATH,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
  const alreadyImported = importDeclarations.some((decl) => {
    const spec = ts.isStringLiteral(decl.moduleSpecifier) ? decl.moduleSpecifier.text : '';
    return spec === importPath || decl.getText(sourceFile).includes(moduleSymbol);
  });

  let updated = content;

  // Modify bottom-to-top so AST node offsets remain valid.
  const importsArray = findModuleImportsArray(sourceFile);
  if (importsArray) {
    const alreadyInImports = importsArray.elements.some(
      (el) => el.getText(sourceFile).trim() === moduleSymbol,
    );
    if (!alreadyInImports) {
      const insertPos = importsArray.getEnd() - 1; // right before ']'
      const hasElements = importsArray.elements.length > 0;
      const lastEl = hasElements
        ? importsArray.elements[importsArray.elements.length - 1]
        : undefined;
      const hasTrailingComma =
        lastEl !== undefined ? updated.slice(lastEl.getEnd(), insertPos).includes(',') : false;
      const prefix = !hasElements ? '' : hasTrailingComma ? ' ' : ', ';
      updated = updated.slice(0, insertPos) + `${prefix}${moduleSymbol}` + updated.slice(insertPos);
    }
  }

  if (!alreadyImported) {
    const importStatement = `import { ${moduleSymbol} } from '${importPath}';\n`;
    const lastImport = importDeclarations[importDeclarations.length - 1];
    if (lastImport) {
      const endOfLine = updated.indexOf('\n', lastImport.getEnd());
      const insertAt = endOfLine === -1 ? lastImport.getEnd() : endOfLine + 1;
      updated = updated.slice(0, insertAt) + importStatement + updated.slice(insertAt);
    } else {
      updated = importStatement + updated;
    }
  }

  tree.write(FEATURES_MODULE_PATH, updated);
}

function findModuleImportsArray(sourceFile: ts.SourceFile): ts.ArrayLiteralExpression | undefined {
  let result: ts.ArrayLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Module' &&
      node.arguments.length > 0
    ) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        for (const prop of firstArg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            prop.name.getText(sourceFile) === 'imports' &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            result = prop.initializer;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

/**
 * Safely injects `{ name: '<fileName>', prefix: '<constantName>' }` into
 * `export const GATEWAY_SERVICES = [...]` in `apps/api/src/app/gateway-services.ts`.
 */
export function injectIntoGatewayServices(
  tree: Tree,
  opts: { fileName: string; constantName: string },
): void {
  if (!tree.exists(GATEWAY_SERVICES_PATH)) return;
  const content = tree.read(GATEWAY_SERVICES_PATH, 'utf-8');
  if (!content) return;

  const sourceFile = ts.createSourceFile(
    GATEWAY_SERVICES_PATH,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  let arrayNode: ts.ArrayLiteralExpression | undefined;
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === 'GATEWAY_SERVICES' &&
          decl.initializer &&
          ts.isArrayLiteralExpression(decl.initializer)
        ) {
          arrayNode = decl.initializer;
        }
      }
    }
  }

  if (!arrayNode) return;

  const alreadyExists = arrayNode.elements.some((el) => {
    if (!ts.isObjectLiteralExpression(el)) return false;
    return el.properties.some(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name.getText(sourceFile) === 'name' &&
        ts.isStringLiteral(p.initializer) &&
        p.initializer.text === opts.fileName,
    );
  });

  if (alreadyExists) return;

  const insertPos = arrayNode.getEnd() - 1; // right before ']'
  const entry = `  { name: '${opts.fileName}', prefix: '${opts.constantName}' },\n`;
  const before = content.slice(0, insertPos);
  const needsNewline = !before.endsWith('\n');
  const updated = before + (needsNewline ? '\n' : '') + entry + content.slice(insertPos);

  tree.write(GATEWAY_SERVICES_PATH, updated);
}
