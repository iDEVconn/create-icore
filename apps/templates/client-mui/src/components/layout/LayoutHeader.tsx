import { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore, setStoredLocale, type IcoreLocale } from '@icore/template-shared';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

const LOCALES: { code: IcoreLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

export function LayoutHeader() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    window.location.reload();
  }

  function handleMenuOpen(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleMenuClose() {
    setAnchorEl(null);
  }

  function handleLogout() {
    handleMenuClose();
    useAuthStore.getState().logout();
    void navigate({ to: '/login' });
  }

  const currentLocale = i18n.language as IcoreLocale;

  return (
    <AppBar position="sticky" color="default" elevation={1}>
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography variant="h6" component="div" fontWeight={600}>
          iCore{' '}
          <span style={{ opacity: 0.6, fontSize: '0.75em', fontWeight: 400 }}>v{APP_VERSION}</span>
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {LOCALES.map(({ code, label }) => (
              <Button
                key={code}
                size="small"
                variant={currentLocale === code ? 'contained' : 'text'}
                onClick={() => handleLocale(code)}
              >
                {label}
              </Button>
            ))}
          </Box>

          <IconButton onClick={handleMenuOpen} color="inherit" aria-label="user menu">
            <AccountCircleIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {user?.email ?? ''}
              </Typography>
            </MenuItem>
            <MenuItem component={Link} to="/_dashboard/profile" onClick={handleMenuClose}>
              {t('nav.profile')}
            </MenuItem>
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
              {t('common.logout')}
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
