import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../../components/PageLayout';
import { Button } from '../../components/ui/button';
import { NotesTable } from '../../components/notes/NotesTable';
import { NoteDialog } from '../../components/notes/NoteDialog';
import { DeleteNoteConfirm } from '../../components/notes/DeleteNoteConfirm';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useUpdateNote,
  type Note,
} from '../../queries/notes';

const PAGE_SIZE = 20;

function NotesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const { data, isPending } = useNotesList(PAGE_SIZE, page * PAGE_SIZE);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setDialogOpen(true);
  }

  async function handleSubmit(values: { title: string; body: string }) {
    if (editing) {
      await updateNote.mutateAsync({ id: editing.id, patch: values });
    } else {
      await createNote.mutateAsync(values);
    }
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteNote.mutateAsync(deleting.id);
    setDeleting(null);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout
      title={t('notes.title')}
      actions={<Button onClick={openNew}>{t('notes.new')}</Button>}
    >
      {isPending ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('common.loading')}</p>
      ) : (
        <>
          <NotesTable items={data?.items ?? []} onEdit={openEdit} onDelete={setDeleting} />
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ‹
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ›
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <NoteDialog
        open={dialogOpen}
        initial={editing}
        saving={createNote.isPending || updateNote.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
      <DeleteNoteConfirm
        note={deleting}
        deleting={deleteNote.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/notes')({
  component: NotesPage,
});
