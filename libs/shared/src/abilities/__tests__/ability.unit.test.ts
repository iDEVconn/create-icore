import { describe, expect, it } from 'vitest';
import { defineAbilitiesFor, emptyAbility } from '../ability';

describe('defineAbilitiesFor', () => {
  it('grants admin manage on all', () => {
    const ability = defineAbilitiesFor({ id: 'u1', role: 'admin' });
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('denies regular user by default', () => {
    const ability = defineAbilitiesFor({ id: 'u2', role: 'user' });
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('read', 'User')).toBe(false);
  });

  it('denies everything for null user', () => {
    const ability = defineAbilitiesFor(null);
    expect(ability.can('read', 'Profile')).toBe(false);
  });
});

describe('emptyAbility', () => {
  it('denies everything', () => {
    const ability = emptyAbility();
    expect(ability.can('manage', 'all')).toBe(false);
  });
});
