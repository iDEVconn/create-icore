import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import type { Note } from '../../queries/notes';

interface Props {
  items: Note[];
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function NotesTable({ items, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t('notes.empty')}</p>;
  }
  return (
    <table className="border-border w-full border-collapse text-sm">
      <thead>
        <tr className="border-border border-b">
          <th className="px-3 py-2 text-left font-medium">{t('notes.noteTitle')}</th>
          <th className="px-3 py-2 text-left font-medium">{t('notes.noteBody')}</th>
          <th className="px-3 py-2 text-right font-medium" />
        </tr>
      </thead>
      <tbody>
        {items.map((n) => (
          <tr key={n.id} className="border-border/50 border-b last:border-0">
            <td className="px-3 py-2">{n.title}</td>
            <td className="text-muted-foreground max-w-md truncate px-3 py-2">{n.body}</td>
            <td className="space-x-2 px-3 py-2 text-right">
              <Button variant="ghost" size="sm" onClick={() => onEdit(n)}>
                {t('notes.edit')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(n)}>
                {t('notes.delete')}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
