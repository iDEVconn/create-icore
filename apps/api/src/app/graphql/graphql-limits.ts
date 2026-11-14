import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface LimitOptions {
  /** Deepest allowed field nesting; `{ a }` has depth 1, `{ a { b } }` depth 2. */
  maxDepth: number;
  /** Most aliased fields allowed in one document (fragments included). */
  maxAliases: number;
}

/**
 * Validation rules that cap the cost of a single document before it executes:
 * nesting depth (stops `{ a { b { a { b … } } } }`) and alias count (stops
 * `{ x1: me { … } x2: me { … } … }` repeating an expensive field). Batching is
 * off at the server, so one request is one document and these limits hold per request.
 */
export function createLimitRules(opts: LimitOptions): ValidationRule[] {
  return [depthLimitRule(opts.maxDepth), aliasLimitRule(opts.maxAliases)];
}

function depthLimitRule(maxDepth: number): ValidationRule {
  return (context: ValidationContext): ASTVisitor => ({
    OperationDefinition(node) {
      const fragments = fragmentMap(context);
      const depth = selectionDepth(node.selectionSet, fragments, new Set());
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(`Query depth ${depth} exceeds the maximum of ${maxDepth}.`, {
            nodes: [node],
          }),
        );
      }
    },
  });
}

function aliasLimitRule(maxAliases: number): ValidationRule {
  return (context: ValidationContext): ASTVisitor => {
    let aliases = 0;
    return {
      Field(node) {
        if (node.alias) aliases++;
      },
      Document: {
        leave(node) {
          if (aliases > maxAliases) {
            context.reportError(
              new GraphQLError(`${aliases} aliases exceed the maximum of ${maxAliases}.`, {
                nodes: [node],
              }),
            );
          }
        },
      },
    };
  };
}

function fragmentMap(context: ValidationContext): Map<string, FragmentDefinitionNode> {
  const map = new Map<string, FragmentDefinitionNode>();
  for (const def of context.getDocument().definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) map.set(def.name.value, def);
  }
  return map;
}

// Introspection (`__schema`, `__type`) is not counted: it is disabled in production, and
// GraphiQL's own introspection query is deeper than any sane application limit.
function selectionDepth(
  set: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visiting: Set<string>,
): number {
  let max = 0;
  for (const selection of set.selections) {
    max = Math.max(max, depthOf(selection, fragments, visiting));
  }
  return max;
}

function depthOf(
  selection: SelectionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visiting: Set<string>,
): number {
  if (selection.kind === Kind.FIELD) {
    if (selection.name.value.startsWith('__')) return 0;
    const below = selection.selectionSet
      ? selectionDepth(selection.selectionSet, fragments, visiting)
      : 0;
    return 1 + below;
  }
  if (selection.kind === Kind.INLINE_FRAGMENT) {
    return selectionDepth(selection.selectionSet, fragments, visiting);
  }
  const name = selection.name.value;
  const fragment = fragments.get(name);
  // A cycle or an unknown fragment is reported by graphql's own rules; just stop here.
  if (!fragment || visiting.has(name)) return 0;
  visiting.add(name);
  const depth = selectionDepth(fragment.selectionSet, fragments, visiting);
  visiting.delete(name);
  return depth;
}
