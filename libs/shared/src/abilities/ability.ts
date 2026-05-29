import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { AbilityAction, AbilitySubject } from './subjects';

export type AppAbility = MongoAbility<[AbilityAction, AbilitySubject]>;

export interface AbilityUser {
  id: string;
  role: 'admin' | 'user';
}

export function defineAbilitiesFor(user: AbilityUser | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (user?.role === 'admin') {
    can('manage', 'all');
  } else if (user) {
    can('read', 'Note', { ownerId: user.id } as never);
    can('create', 'Note');
    can(['update', 'delete'], 'Note', { ownerId: user.id } as never);
  }
  return build();
}

export function emptyAbility(): AppAbility {
  return createMongoAbility<[AbilityAction, AbilitySubject]>([]);
}
