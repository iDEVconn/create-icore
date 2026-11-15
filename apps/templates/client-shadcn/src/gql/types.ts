/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type CreateNoteInput = {
  body: string;
  title: string;
};

export type UpdateNoteInput = {
  body?: string | null | undefined;
  title?: string | null | undefined;
};

export type NoteFieldsFragment = { id: string, ownerId: string, title: string, body: string, createdAt: string, updatedAt: string };

export type ListNotesQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type ListNotesQuery = { notes: { total: number, items: Array<{ id: string, ownerId: string, title: string, body: string, createdAt: string, updatedAt: string }> } };

export type GetNoteQueryVariables = Exact<{
  id: string | number;
}>;


export type GetNoteQuery = { note: { id: string, ownerId: string, title: string, body: string, createdAt: string, updatedAt: string } };

export type CreateNoteMutationVariables = Exact<{
  input: CreateNoteInput;
}>;


export type CreateNoteMutation = { createNote: { id: string, ownerId: string, title: string, body: string, createdAt: string, updatedAt: string } };

export type UpdateNoteMutationVariables = Exact<{
  id: string | number;
  input: UpdateNoteInput;
}>;


export type UpdateNoteMutation = { updateNote: { id: string, ownerId: string, title: string, body: string, createdAt: string, updatedAt: string } };

export type DeleteNoteMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteNoteMutation = { deleteNote: boolean };

export type GetMeQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMeQuery = { me: { uid: string, email: string, role: string | null, name: string | null } };

export type UpdateProfileMutationVariables = Exact<{
  name: string;
}>;


export type UpdateProfileMutation = { updateProfile: { uid: string, name: string | null } };
