import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface LimitOptions {
  /** Deepest allowed field nesting; `{ a }` has depth 1, `{ a { b } }` depth 2. */
  maxDepth: number;
  /** Most aliased fields one operation may resolve, counted after fragment expansion. */
  maxAliases: number;
}

/**
 * A validation rule that caps the cost of each operation before it executes: nesting depth
 * (stops `{ a { b { a { b … } } } }`) and aliased-field count (stops `{ x1: me x2: me … }`
 * repeating an expensive field). Batching is off at the server, so one request is one document.
 *
 * Validation runs before any guard or throttle, so the rule itself must be cheap: each fragment
 * is measured once (memoised) and a spread reuses that result, which keeps the walk linear in
 * the document size even for fragment chains that expand exponentially. Aliases are counted per
 * execution: a fragment spread twice counts its aliases twice, so fragments cannot hide them.
 */
export function createLimitRules(opts: LimitOptions): ValidationRule[] {
  return [costLimitRule(opts)];
}

interface Cost {
  depth: number;
  aliases: number;
}

function costLimitRule({ maxDepth, maxAliases }: LimitOptions): ValidationRule {
  return (context: ValidationContext): ASTVisitor => {
    const walker = new CostWalker(context);
    return {
      OperationDefinition(node) {
        const { depth, aliases } = walker.selectionSet(node.selectionSet);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query depth ${depth} exceeds the maximum of ${maxDepth}.`, {
              nodes: [node],
            }),
          );
        }
        if (aliases > maxAliases) {
          context.reportError(
            new GraphQLError(`${aliases} aliases exceed the maximum of ${maxAliases}.`, {
              nodes: [node],
            }),
          );
        }
      },
    };
  };
}

class CostWalker {
  private readonly fragments = new Map<string, FragmentDefinitionNode>();
  private readonly memo = new Map<string, Cost>();
  private readonly visiting = new Set<string>();

  constructor(context: ValidationContext) {
    for (const def of context.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) this.fragments.set(def.name.value, def);
    }
  }

  selectionSet(set: SelectionSetNode): Cost {
    let depth = 0;
    let aliases = 0;
    for (const selection of set.selections) {
      const cost = this.selection(selection);
      depth = Math.max(depth, cost.depth);
      aliases += cost.aliases;
    }
    return { depth, aliases };
  }

  private selection(selection: SelectionSetNode['selections'][number]): Cost {
    if (selection.kind === Kind.FIELD) {
      // Introspection (`__schema`, `__type`) is not counted: it is disabled in production, and
      // GraphiQL's own introspection query is deeper than any sane application limit.
      if (selection.name.value.startsWith('__')) return { depth: 0, aliases: 0 };
      const below = selection.selectionSet
        ? this.selectionSet(selection.selectionSet)
        : { depth: 0, aliases: 0 };
      return { depth: 1 + below.depth, aliases: below.aliases + (selection.alias ? 1 : 0) };
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) return this.selectionSet(selection.selectionSet);
    return this.fragment(selection.name.value);
  }

  private fragment(name: string): Cost {
    const known = this.memo.get(name);
    if (known) return known;
    const fragment = this.fragments.get(name);
    // A cycle or an unknown fragment is reported by graphql's own rules; count nothing for it.
    if (!fragment || this.visiting.has(name)) return { depth: 0, aliases: 0 };
    this.visiting.add(name);
    const cost = this.selectionSet(fragment.selectionSet);
    this.visiting.delete(name);
    this.memo.set(name, cost);
    return cost;
  }
}
