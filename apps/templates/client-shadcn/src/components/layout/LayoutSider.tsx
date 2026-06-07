import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutDashboard, StickyNote, User } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard' as const, icon: LayoutDashboard, labelKey: 'nav.dashboard', exact: true },
  { to: '/notes' as const, icon: StickyNote, labelKey: 'nav.notes', exact: false },
  { to: '/profile' as const, icon: User, labelKey: 'nav.profile', exact: false },
];

export function LayoutSider() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex flex-col border-r border-[--color-border] bg-[--color-card] transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-52'
      }`}
    >
      <nav className="flex flex-col gap-0.5 p-2 flex-1 pt-3">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact }}
            className="group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground] [&.active]:bg-[--color-primary]/10 [&.active]:text-[--color-primary] [&.active]:font-medium cursor-pointer"
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span className="truncate">{t(labelKey)}</span>}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[--color-border] bg-[--color-card] text-[--color-muted-foreground] shadow-sm hover:text-[--color-foreground] transition-colors"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
