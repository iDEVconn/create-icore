import { SyntheticEvent, useEffect, useState } from 'react';
import { SyntheticEvent, useTranslation } from 'react-i18next';
import { SyntheticEvent, Button } from '../ui/button';
import { SyntheticEvent, Input } from '../ui/input';
import { SyntheticEvent, Label } from '../ui/label';
import type { Note } from '../../queries/notes';

interface Props {
  open: boolean;
  initial: Note | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string; body: string }) => void;
}

export function NoteDialog({ open, initial, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setBody(initial?.body ?? '');
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({ title, body });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full max-w-md rounded-lg border p-6 shadow-lg"
      >
        <h2 className="mb-4 text-lg font-semibold">{initial ? t('notes.edit') : t('notes.new')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note-title">{t('notes.noteTitle')}</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-body">{t('notes.noteBody')}</Label>
            <textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('notes.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('notes.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
