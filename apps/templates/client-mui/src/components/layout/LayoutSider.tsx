import { Drawer, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { NAV_CONFIG, type NavItem } from '@/nav.config';

const DRAWER_WIDTH = 220;

const ICONS: Record<NavItem['iconName'], ReactNode> = {
  dashboard: <DashboardOutlinedIcon />,
  notes: <NoteOutlinedIcon />,
  profile: <PersonOutlineIcon />,
};

export function LayoutSider() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          position: 'relative',
          boxSizing: 'border-box',
        },
      }}
    >
      <List>
        {NAV_CONFIG.map(({ to, iconName, labelKey, exact }) => (
          <ListItemButton
            key={to}
            component={Link}
            to={to}
            selected={exact ? pathname === to : pathname.includes(to)}
          >
            <ListItemIcon>{ICONS[iconName]}</ListItemIcon>
            <ListItemText primary={t(labelKey)} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
}
