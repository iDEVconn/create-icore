import { Layout } from 'antd';

export function LayoutFooter() {
  const year = new Date().getFullYear();
  return (
    <Layout.Footer style={{ textAlign: 'center', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
      &copy; iCore {year}
    </Layout.Footer>
  );
}
