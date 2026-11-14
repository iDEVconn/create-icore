import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_SURFACE_RESOLVERS } from '../api-surface-resolvers';
import { emitSchema } from '../schema-emitter';

// The committed schema is the client's codegen input. It must match what the resolvers print;
// regenerate with `yarn nx run api:graphql-schema`. Compared in memory: tests never write it.
describe('committed apps/api/schema.gql', () => {
  it('equals the schema emitted from the API surface resolvers', async () => {
    const committed = readFileSync(join(__dirname, '..', '..', '..', '..', 'schema.gql'), 'utf8');
    expect(await emitSchema(API_SURFACE_RESOLVERS)).toBe(committed);
  });

  it('exposes the agreed operations and types', async () => {
    const sdl = await emitSchema(API_SURFACE_RESOLVERS);
    for (const line of [
      'notes(limit: Int, offset: Int): NotePage!',
      'note(id: ID!): Note!',
      'me: Profile!',
      'files(prefix: String): [StorageRef!]!',
      'signedUrl(bucket: String!, path: String!, ttlSec: Int): String!',
      'createNote(input: CreateNoteInput!): Note!',
      'updateNote(id: ID!, input: UpdateNoteInput!): Note!',
      'deleteNote(id: ID!): Boolean!',
      'removeFile(bucket: String!, path: String!): Boolean!',
      'items: [Note!]!',
      'total: Int!',
    ]) {
      expect(sdl).toContain(line);
    }
    expect(sdl).toMatch(
      /type Note \{\n {2}body: String!\n {2}createdAt: String!\n {2}id: String!\n {2}ownerId: String!\n {2}title: String!\n {2}updatedAt: String!\n\}/,
    );
    expect(sdl).toMatch(/type StorageRef \{\n {2}bucket: String!\n {2}path: String!\n\}/);
    // role is optional on the session record (VerifiedToken), so it is nullable here.
    expect(sdl).toMatch(
      /type Profile \{\n {2}email: String!\n {2}role: String\n {2}uid: String!\n\}/,
    );
    expect(sdl).toMatch(/input CreateNoteInput \{\n {2}body: String!\n {2}title: String!\n\}/);
    expect(sdl).toMatch(/input UpdateNoteInput \{\n {2}body: String\n {2}title: String\n\}/);
  });
});
