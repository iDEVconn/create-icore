import { Button } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '@icore/template-shared';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return (
    <Button
      type="text"
      size="small"
      icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}
