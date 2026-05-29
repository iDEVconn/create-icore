import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { LayoutHeader } from '../components/layout/LayoutHeader';
import { LayoutSider } from '../components/layout/LayoutSider';
import { LayoutFooter } from '../components/layout/LayoutFooter';
import { NotificationHost } from '../components/NotificationHost';

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LayoutHeader />
      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        <LayoutSider />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
      <LayoutFooter />
      <NotificationHost />
    </Box>
  );
}
