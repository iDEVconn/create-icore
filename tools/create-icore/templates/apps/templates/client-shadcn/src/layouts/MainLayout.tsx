import type { ReactNode } from 'react';
import { LayoutHeader } from '../components/layout/LayoutHeader';
import { LayoutSider } from '../components/layout/LayoutSider';
import { LayoutFooter } from '../components/layout/LayoutFooter';

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <LayoutHeader />
      <div className="flex-1 flex">
        <LayoutSider />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <LayoutFooter />
    </div>
  );
}
