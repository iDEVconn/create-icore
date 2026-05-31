import { Drawer, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const DRAWER_WIDTH = 220;

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
        <ListItemButton component={Link} to="/dashboard" selected={pathname === '/dashboard'}>
          <ListItemIcon>
            <DashboardOutlinedIcon />
          </ListItemIcon>
          <ListItemText primary={t('nav.dashboard')} />
        </ListItemButton>

        <ListItemButton component={Link} to="/notes" selected={pathname.includes('/notes')}>
          <ListItemIcon>
            <NoteOutlinedIcon />
          </ListItemIcon>
          <ListItemText primary={t('notes.title')} />
        </ListItemButton>

        <ListItemButton component={Link} to="/profile" selected={pathname === '/profile'}>
          <ListItemIcon>
            <PersonOutlineIcon />
          </ListItemIcon>
          <ListItemText primary={t('nav.profile')} />
        </ListItemButton>
      </List>
    </Drawer>
  );
}
