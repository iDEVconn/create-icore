import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@icore/template-shared';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      {mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
