import { Button, Dropdown, Layout, Space, type MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuthStore, setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { ThemeToggle } from '../ThemeToggle';

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

  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    void i18n.changeLanguage(code);
  }

  function handleLogout() {
    useAuthStore.getState().logout();
    void navigate({ to: '/login' });
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'email',
      label: <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{user?.email ?? ''}</span>,
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'profile',
      label: <Link to="/profile">{t('nav.profile')}</Link>,
    },
    {
      key: 'logout',
      label: t('common.logout'),
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <Space>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>iCore</span>
        <span
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11,
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          v{APP_VERSION}
        </span>
      </Space>

      <Space size="middle">
        <Space size={4}>
          {LOCALES.map(({ code, label }) => (
            <Button
              key={code}
              size="small"
              type="text"
              style={{ color: 'rgba(255,255,255,0.65)' }}
              onClick={() => handleLocale(code)}
            >
              {label}
            </Button>
          ))}
        </Space>

        <ThemeToggle />

        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
          <Button type="text" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {user?.email ?? 'Account'} ▾
          </Button>
        </Dropdown>
      </Space>
    </Layout.Header>
  );
}
