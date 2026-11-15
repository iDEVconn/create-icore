import notesDocument from './gql/notes.graphql';
import { operation } from './operation';
import type {
  CreateNoteMutation,
  CreateNoteMutationVariables,
  DeleteNoteMutation,
  DeleteNoteMutationVariables,
  GetNoteQuery,
  GetNoteQueryVariables,
  ListNotesQuery,
  ListNotesQueryVariables,
  UpdateNoteMutation,
  UpdateNoteMutationVariables,
} from '../gql/types';

export const ListNotes = operation<ListNotesQuery, ListNotesQueryVariables>(
  notesDocument,
  'ListNotes',
);
export const GetNote = operation<GetNoteQuery, GetNoteQueryVariables>(notesDocument, 'GetNote');
export const CreateNote = operation<CreateNoteMutation, CreateNoteMutationVariables>(
  notesDocument,
  'CreateNote',
);
export const UpdateNote = operation<UpdateNoteMutation, UpdateNoteMutationVariables>(
  notesDocument,
  'UpdateNote',
);
export const DeleteNote = operation<DeleteNoteMutation, DeleteNoteMutationVariables>(
  notesDocument,
  'DeleteNote',
);
