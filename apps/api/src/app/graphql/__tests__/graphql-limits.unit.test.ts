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
});
