import {
  Kind,
  visit,
  type DefinitionNode,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
} from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

function isOperation(def: DefinitionNode): def is OperationDefinitionNode {
  return def.kind === Kind.OPERATION_DEFINITION;
}

function isFragment(def: DefinitionNode): def is FragmentDefinitionNode {
  return def.kind === Kind.FRAGMENT_DEFINITION;
}

function spreadNames(node: OperationDefinitionNode | FragmentDefinitionNode): string[] {
  const names: string[] = [];
  visit(node, {
    FragmentSpread(spread) {
      names.push(spread.name.value);
    },
  });
  return names;
}

/**
 * Extract one named operation from a multi-operation `.graphql` document,
 * together with every fragment it uses (transitively), typed with the
 * codegen result/variables types so `request()` infers both.
 *
 * Throws, listing the operations the document does contain, when `name` is
 * not one of them: a typo fails at import time instead of at request time.
 */
export function operation<TData, TVars>(
  document: DocumentNode,
  name: string,
): TypedDocumentNode<TData, TVars> {
  const op = document.definitions.find(
    (def): def is OperationDefinitionNode => isOperation(def) && def.name?.value === name,
  );
  if (!op) {
    const available = document.definitions
      .filter(isOperation)
      .map((def) => def.name?.value)
      .filter(Boolean)
      .join(', ');
    throw new Error(`Operation "${name}" not found. Available operations: ${available}`);
  }

  const fragments = new Map(
    document.definitions.filter(isFragment).map((def) => [def.name.value, def]),
  );
  const used: FragmentDefinitionNode[] = [];
  const seen = new Set<string>();
  const pending = spreadNames(op);
  while (pending.length > 0) {
    const fragmentName = pending.shift() as string;
    if (seen.has(fragmentName)) continue;
    seen.add(fragmentName);
    const fragment = fragments.get(fragmentName);
    if (!fragment) continue;
    used.push(fragment);
    pending.push(...spreadNames(fragment));
  }

  return { kind: Kind.DOCUMENT, definitions: [op, ...used] };
}
