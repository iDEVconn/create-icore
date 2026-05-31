import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';

export function AccessDeniedPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-6">
      <h1 className="text-2xl font-semibold">{t('error.accessDenied')}</h1>
      <p className="text-muted-foreground">{t('error.unknown')}</p>
      <Link to="/dashboard" className="mt-4 underline">
        ← Dashboard
      </Link>
    </div>
  );
}
