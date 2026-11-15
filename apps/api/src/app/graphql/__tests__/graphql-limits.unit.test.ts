import { buildSchema, parse, specifiedRules, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createLimitRules } from '../graphql-limits';

const schema = buildSchema(`
  type Node { id: String! child: Node! }
  type Query { tree: Node! ping: String! }
`);

const rules = createLimitRules({ maxDepth: 8, maxAliases: 15 });

function check(query: string): string[] {
  return validate(schema, parse(query), [...specifiedRules, ...rules]).map((e) => e.message);
}

function nested(depth: number): string {
  let inner = 'id';
  for (let i = 2; i < depth; i++) inner = `child { ${inner} }`;
  return `{ tree { ${inner} } }`;
}

describe('createLimitRules', () => {
  it('accepts a query of depth 8', () => {
    expect(check(nested(8))).toEqual([]);
  });

  it('flags a query of depth 9', () => {
    const errors = check(nested(9));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/depth 9 exceeds the maximum of 8/);
  });

  it('follows fragments when measuring depth', () => {
    const query = `
      query { tree { ...Deep } }
      fragment Deep on Node { child { child { child { child { child { child { child { child { id } } } } } } } } }
    `;
    expect(check(query)[0]).toMatch(/depth/);
  });

  it('does not loop on a fragment cycle (graphql reports the cycle itself)', () => {
    const query = `
      query { tree { ...A } }
      fragment A on Node { child { ...B } }
      fragment B on Node { child { ...A } }
    `;
    expect(() => check(query)).not.toThrow();
  });

  it('ignores introspection fields when measuring depth', () => {
    const query = `{ __schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } } }`;
    expect(check(query)).toEqual([]);
  });

  it('accepts 15 aliases', () => {
    const aliases = Array.from({ length: 15 }, (_, i) => `a${i}: ping`).join(' ');
    expect(check(`{ ${aliases} }`)).toEqual([]);
  });

  it('flags 16 aliases', () => {
    const aliases = Array.from({ length: 16 }, (_, i) => `a${i}: ping`).join(' ');
    const errors = check(`{ ${aliases} }`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/16 aliases exceed the maximum of 15/);
  });

  it('counts aliases inside fragments too', () => {
    const aliases = Array.from({ length: 16 }, (_, i) => `a${i}: id`).join(' ');
    const errors = check(`query { tree { ...F } } fragment F on Node { ${aliases} }`);
    expect(errors[0]).toMatch(/aliases/);
  });

  // Fragment chains: F0 spreads F1 `spreads` times, F1 spreads F2, ... A naive walk re-expands
  // every spread (spreads^n work) before any guard runs.
  function chain(n: number, spreads: number, body: (next: string) => string): string {
    const fragments: string[] = [];
    for (let i = 0; i < n; i++) {
      const next = Array.from({ length: spreads }, () => `...F${i + 1}`).join(' ');
      fragments.push(`fragment F${i} on Node { ${body(next)} }`);
    }
    fragments.push(`fragment F${n} on Node { id }`);
    return `query { tree { ...F0 } } ${fragments.join(' ')}`;
  }

  function timed(query: string): { errors: string[]; ms: number } {
    const doc = parse(query);
    const start = performance.now();
    const errors = validate(schema, doc, rules).map((e) => e.message);
    return { errors, ms: performance.now() - start };
  }

  it('validates a 30-fragment doubling chain in linear time', () => {
    const { errors, ms } = timed(chain(30, 2, (next) => next));
    expect(errors).toEqual([]);
    expect(ms).toBeLessThan(100);
  });

  it('validates a 30-fragment tripling chain in linear time', () => {
    const { errors, ms } = timed(chain(30, 3, (next) => next));
    expect(errors).toEqual([]);
    expect(ms).toBeLessThan(100);
  });

  it('still reports the right depth through a doubling chain', () => {
    // tree + 30 nested `child` levels + id = depth 32
    const { errors, ms } = timed(chain(30, 2, (next) => `child { ${next} }`));
    expect(errors).toEqual(['Query depth 32 exceeds the maximum of 8.']);
    expect(ms).toBeLessThan(100);
  });

  it('counts aliases per execution: a fragment spread twice counts its aliases twice', () => {
    // 6 doubling fragments with one alias each + a leaf with 9 aliases: 15 aliases in the
    // document, but 2^6 * 9 + 63 = 639 aliased fields would be resolved. Depth stays 8.
    const leaf = Array.from({ length: 9 }, (_, i) => `a${i}: id`).join(' ');
    const fragments: string[] = [];
    for (let i = 0; i < 6; i++) {
      fragments.push(`fragment F${i} on Node { child { ...F${i + 1} } x: child { ...F${i + 1} } }`);
    }
    fragments.push(`fragment F6 on Node { ${leaf} }`);
    const { errors } = timed(`query { tree { ...F0 } } ${fragments.join(' ')}`);
    expect(errors).toEqual(['639 aliases exceed the maximum of 15.']);
  });

  it('counts aliases separately per operation', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `a${i}: ping`).join(' ');
    expect(check(`query A { ${eight} } query B { ${eight} }`)).toEqual([]);
  });

  it('handles a 40-fragment tripling alias chain in linear time', () => {
    const { errors, ms } = timed(chain(40, 3, (next) => `x: child { ${next} }`));
    expect(errors.some((e) => /aliases exceed/.test(e))).toBe(true);
    expect(ms).toBeLessThan(100);
  });

  // A long single-spread chain (f0 -> f1 -> ... -> fN) recurses once per fragment. Past the JS
  // stack the walker must report a validation error (HTTP 400), never throw (HTTP 500).
  it('reports a too deeply nested fragment chain instead of throwing', () => {
    const n = 2_500;
    const defs = Array.from({ length: n }, (_, i) => `fragment f${i} on Query { ...f${i + 1} }`);
    const doc = parse(`{ ...f0 } ${defs.join(' ')} fragment f${n} on Query { ping }`);
    let errors: string[] = [];
    expect(() => {
      errors = validate(schema, doc, rules).map((e) => e.message);
    }).not.toThrow();
    expect(errors).toEqual([expect.stringMatching(/too deeply nested/i)]);
  });
});
