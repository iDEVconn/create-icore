import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useAuthStore, setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { Button } from '../ui/button';
import { ThemeToggle } from '../ThemeToggle';

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[--color-border] bg-[--color-background]/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-[--color-primary]">
          <span className="text-xs font-bold text-[--color-primary-foreground]">i</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">iCore</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center rounded-md border border-[--color-border] overflow-hidden mr-2">
          {LOCALES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => handleLocale(code)}
              className="px-2.5 py-1 text-xs text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground] transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>

        <ThemeToggle />

        <div className="hidden sm:flex items-center gap-2 ml-1 pl-2 border-l border-[--color-border]">
          <span className="text-xs text-[--color-muted-foreground] max-w-[140px] truncate">
            {user?.email ?? ''}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label={t('common.logout')}
            className="h-8 w-8 cursor-pointer"
          >
            <LogOut size={15} />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="sm:hidden cursor-pointer"
        >
          <LogOut size={15} />
        </Button>
      </div>
    </header>
  );
}
