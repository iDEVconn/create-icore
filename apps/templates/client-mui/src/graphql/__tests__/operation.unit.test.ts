import { describe, expect, it } from 'vitest';
import { Kind, parse, type OperationDefinitionNode } from 'graphql';
import notesDocument from '../gql/notes.graphql';
import { operation } from '../operation';

function names(doc: { definitions: readonly { kind: string; name?: { value: string } }[] }) {
  return doc.definitions.map((d) => `${d.kind}:${d.name?.value ?? ''}`);
}

describe('operation (extract one named operation from a .graphql document)', () => {
  it('loads notes.graphql through the vite graphql loader', () => {
    const ops = notesDocument.definitions
      .filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION)
      .map((d) => d.name?.value);
    expect(ops).toEqual(['ListNotes', 'GetNote', 'CreateNote', 'UpdateNote', 'DeleteNote']);
  });

  it('extracts ListNotes and the NoteFields fragment it spreads, nothing else', () => {
    const doc = operation(notesDocument, 'ListNotes');
    expect(doc.kind).toBe(Kind.DOCUMENT);
    expect(names(doc)).toEqual(['OperationDefinition:ListNotes', 'FragmentDefinition:NoteFields']);
  });

  it('keeps the fragments the operation uses, transitively, and drops the others', () => {
    const source = parse(`
      query A { me { ...P } }
      query B { me { uid } }
      fragment P on Profile { uid ...Q }
      fragment Q on Profile { email }
      fragment Unused on Profile { role }
    `);
    expect(names(operation(source, 'A'))).toEqual([
      'OperationDefinition:A',
      'FragmentDefinition:P',
      'FragmentDefinition:Q',
    ]);
    expect(names(operation(source, 'B'))).toEqual(['OperationDefinition:B']);
  });

  it('throws listing the available operation names for an unknown name', () => {
    expect(() => operation(notesDocument, 'Nope')).toThrow(
      'Operation "Nope" not found. Available operations: ListNotes, GetNote, CreateNote, UpdateNote, DeleteNote',
    );
  });
});
