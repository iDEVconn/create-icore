import type { InferSubjects } from '@casl/ability';

export type AbilityAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

// NoteSubject is the shaped object passed to subject('Note', { ... }) in tests
// and on the frontend <Can>. Included in AbilitySubject so ability.can() accepts
// tagged instances, not just the string name.
export interface NoteSubject {
  id: string;
  ownerId: string;
}

export type AbilitySubject = InferSubjects<NoteSubject> | 'all' | 'User' | 'Profile' | 'Note';
