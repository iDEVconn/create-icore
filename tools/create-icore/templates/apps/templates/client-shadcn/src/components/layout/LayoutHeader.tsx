import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore, setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { Button } from '../ui/button';

const LOCALES: { code: IcoreLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

export function LayoutHeader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    window.location.reload();
  }

  function handleLogout() {
    logout();
    void navigate({ to: '/login' });
  }

  return (
    <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-background">
      <span className="font-semibold text-foreground tracking-tight">icore</span>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          {LOCALES.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => handleLocale(code)}
              className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {user?.email ?? ''}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            {t('common.logout')}
          </Button>
        </div>
      </div>
    </header>
  );
}
