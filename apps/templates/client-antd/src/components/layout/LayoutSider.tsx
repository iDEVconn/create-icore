import { useState } from 'react';
import { Layout, Menu, type MenuProps } from 'antd';
import { DashboardOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { NAV_CONFIG, type NavItem } from '@/nav.config';

const ICONS: Record<NavItem['iconName'], ReactNode> = {
  dashboard: <DashboardOutlined />,
  notes: <FileTextOutlined />,
  profile: <UserOutlined />,
};

export function LayoutSider() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const selected = NAV_CONFIG.find((n) => pathname.includes(n.to))?.to ?? '/dashboard';

  const items: MenuProps['items'] = NAV_CONFIG.map((n) => ({
    key: n.to,
    icon: ICONS[n.iconName],
    label: <Link to={n.to}>{t(n.labelKey)}</Link>,
  }));

  return (
    <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
      <Menu
        mode="inline"
        selectedKeys={[selected]}
        items={items}
        style={{ height: '100%', borderRight: 0 }}
      />
    </Layout.Sider>
  );
}
