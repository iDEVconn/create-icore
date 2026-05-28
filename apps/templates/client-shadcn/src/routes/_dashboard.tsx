import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@icore/template-shared';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: () => {
    if (!useAuthStore.getState().accessToken) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
