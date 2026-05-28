import { createFileRoute, Link } from '@tanstack/react-router';
import { useAuthStore } from '@icore/template-shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { PageLayout } from '../../components/PageLayout';

function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageLayout title="Dashboard" description={`Welcome back, ${user?.email ?? 'guest'}`}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Hello, world</CardTitle>
          <CardDescription>Edit this page in src/routes/_dashboard/dashboard.tsx</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/_dashboard/profile" className="underline">
            Go to profile →
          </Link>
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardHome,
});
