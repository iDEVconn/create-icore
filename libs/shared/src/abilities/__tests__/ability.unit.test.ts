import { describe, expect, it } from 'vitest';
import { subject } from '@casl/ability';
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

describe('defineAbilitiesFor — Note rules', () => {
  it('owner can read own note', () => {
    const ability = defineAbilitiesFor({ id: 'u1', role: 'user' });
    expect(ability.can('read', subject('Note', { id: 'n1', ownerId: 'u1' }))).toBe(true);
  });

  it('non-owner cannot read another user note', () => {
    const ability = defineAbilitiesFor({ id: 'u1', role: 'user' });
    expect(ability.can('read', subject('Note', { id: 'n1', ownerId: 'u2' }))).toBe(false);
  });

  it('any user can create a Note', () => {
    const ability = defineAbilitiesFor({ id: 'u1', role: 'user' });
    expect(ability.can('create', 'Note')).toBe(true);
  });

  it('admin can manage any Note', () => {
    const ability = defineAbilitiesFor({ id: 'a1', role: 'admin' });
    expect(ability.can('delete', subject('Note', { id: 'n', ownerId: 'someone' }))).toBe(true);
  });

  it('null user cannot do anything with Note', () => {
    const ability = defineAbilitiesFor(null);
    expect(ability.can('read', 'Note')).toBe(false);
    expect(ability.can('create', 'Note')).toBe(false);
  });
});

describe('emptyAbility', () => {
  it('denies everything', () => {
    const ability = emptyAbility();
    expect(ability.can('manage', 'all')).toBe(false);
  });
});
