import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutDashboard, User } from 'lucide-react';

export function LayoutSider() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex flex-col border-r border-border bg-background transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-48'
      }`}
    >
      <nav className="flex flex-col gap-1 p-2 flex-1">
        <Link
          to="/_dashboard/dashboard"
          activeOptions={{ exact: true }}
          className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-sm text-foreground transition-colors [&.active]:bg-muted [&.active]:font-medium"
        >
          <LayoutDashboard size={16} className="shrink-0" />
          {!collapsed && <span>{t('nav.dashboard')}</span>}
        </Link>
        <Link
          to="/_dashboard/profile"
          className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-sm text-foreground transition-colors [&.active]:bg-muted [&.active]:font-medium"
        >
          <User size={16} className="shrink-0" />
          {!collapsed && <span>{t('nav.profile')}</span>}
        </Link>
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground shadow-sm"
        type="button"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
