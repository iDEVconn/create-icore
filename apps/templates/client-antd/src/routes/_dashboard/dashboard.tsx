import { createFileRoute, Link } from '@tanstack/react-router';
import { Button, Card } from 'antd';
import { useAuthStore } from '@icore/template-shared';
import { PageLayout } from '../../components/PageLayout';

function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageLayout title="Dashboard" description={`Welcome back, ${user?.email ?? 'guest'}`}>
      <Card
        title="Hello, world"
        style={{ maxWidth: 600 }}
        extra={
          <Link to="/profile">
            <Button type="link">Go to profile →</Button>
          </Link>
        }
      >
        Edit this page in src/routes/_dashboard/dashboard.tsx
      </Card>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardHome,
});
