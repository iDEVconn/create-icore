import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { getAccessToken } from '@icore/template-shared';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: () => {
    if (!getAccessToken()) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
