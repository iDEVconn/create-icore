import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import type { Note } from '@/queries/notes';

interface Props {
  note: Note | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteNoteConfirm({ note, deleting, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  if (!note) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full max-w-sm rounded-lg border p-6 shadow-lg"
      >
        <h2 className="mb-2 text-lg font-semibold">{t('notes.confirmDelete')}</h2>
        <p className="text-muted-foreground mb-4 text-sm">{note.title}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            {t('notes.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={deleting}>
            {deleting ? t('common.loading') : t('notes.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
