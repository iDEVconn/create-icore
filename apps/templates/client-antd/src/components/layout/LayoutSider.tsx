import { useState } from 'react';
import { Layout, Menu, type MenuProps } from 'antd';
import { DashboardOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function LayoutSider() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const selectedKey = pathname.includes('/notes')
    ? 'notes'
    : pathname.includes('/profile')
      ? 'profile'
      : 'dashboard';

  const items: MenuProps['items'] = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/_dashboard/dashboard">{t('nav.dashboard')}</Link>,
    },
    {
      key: 'notes',
      icon: <FileTextOutlined />,
      label: <Link to="/_dashboard/notes">{t('notes.title')}</Link>,
    },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <Link to="/_dashboard/profile">{t('nav.profile')}</Link>,
    },
  ];

  return (
    <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        style={{ height: '100%', borderRight: 0 }}
      />
    </Layout.Sider>
  );
}
