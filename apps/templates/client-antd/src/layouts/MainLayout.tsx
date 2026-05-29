import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Affix, Layout, notification } from 'antd';
import { LayoutHeader } from '../components/layout/LayoutHeader';
import { LayoutSider } from '../components/layout/LayoutSider';
import { LayoutFooter } from '../components/layout/LayoutFooter';
import { bindNotifier } from '../lib/notify';

export function MainLayout({ children }: { children: ReactNode }) {
  const [notificationApi, notificationHolder] = notification.useNotification();

  useEffect(() => {
    bindNotifier(notificationApi);
  }, [notificationApi]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {notificationHolder}

      <Affix offsetTop={0}>
        <LayoutHeader />
      </Affix>

      <Layout>
        <LayoutSider />
        <Layout.Content>{children}</Layout.Content>
      </Layout>

      <LayoutFooter />
    </Layout>
  );
}
