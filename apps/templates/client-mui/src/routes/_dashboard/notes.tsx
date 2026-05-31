import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageLayout } from '@/components/PageLayout';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useUpdateNote,
  type Note,
} from '@/queries/notes';

const PAGE_SIZE = 20;

function NotesPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const { data, isPending } = useNotesList(PAGE_SIZE, page * PAGE_SIZE);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '');
      setBody(editing?.body ?? '');
    }
  }, [open, editing]);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setOpen(true);
  }

  async function handleSubmit() {
    if (editing) {
      await updateNote.mutateAsync({ id: editing.id, patch: { title, body } });
    } else {
      await createNote.mutateAsync({ title, body });
    }
    setOpen(false);
  }

  async function handleConfirmDelete() {
    if (!deletingNote) return;
    await deleteNote.mutateAsync(deletingNote.id);
    setDeletingNote(null);
  }

  const items = data?.items ?? [];

  return (
    <PageLayout
      title={t('notes.title')}
      extra={
        <Button variant="contained" onClick={openNew}>
          {t('notes.new')}
        </Button>
      }
    >
      {items.length === 0 && !isPending ? (
        <Typography color="text.secondary">{t('notes.empty')}</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('notes.noteTitle')}</TableCell>
                <TableCell>{t('notes.noteBody')}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((note) => (
                <TableRow key={note.id} hover>
                  <TableCell>{note.title}</TableCell>
                  <TableCell sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {note.body}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton size="small" onClick={() => openEdit(note)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeletingNote(note)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </TableContainer>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? t('notes.edit') : t('notes.new')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={t('notes.noteTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label={t('notes.noteBody')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              multiline
              minRows={4}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('notes.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createNote.isPending || updateNote.isPending}
          >
            {t('notes.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deletingNote)} onClose={() => setDeletingNote(null)}>
        <DialogTitle>{t('notes.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">{deletingNote?.title}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingNote(null)}>{t('notes.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleteNote.isPending}
          >
            {t('notes.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/notes')({
  component: NotesPage,
});
