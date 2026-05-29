import { IconButton } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useTheme } from '@icore/template-shared';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <IconButton color="inherit" onClick={toggle} aria-label="Toggle theme" size="small">
      {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
    </IconButton>
  );
}
