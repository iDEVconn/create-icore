export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListNotesOptions {
  ownerId: string | null;
  limit: number;
  offset: number;
}
