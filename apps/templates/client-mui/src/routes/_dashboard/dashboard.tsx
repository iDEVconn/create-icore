import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, Typography } from '@mui/material';
import { useAuthStore } from '@icore/template-shared';
import { PageLayout } from '../../components/PageLayout';

function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <PageLayout title="Dashboard" description={`Welcome back, ${user?.email ?? 'guest'}`}>
      <Card sx={{ maxWidth: 720 }}>
        <CardHeader
          title="Hello, world"
          subheader="Edit this page in src/routes/_dashboard/dashboard.tsx"
        />
        <CardContent>
          <Typography
            component={Link}
            to="/_dashboard/profile"
            sx={{ textDecoration: 'underline' }}
          >
            Go to profile →
          </Typography>
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardHome,
});
