import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@icore/template-shared';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  // No access token to check anymore -- AuthBootstrap has already resolved
  // GET /auth/session (the cookie-backed source of truth) before any route
  // renders, so the persisted auth store's user is the correct client-side
  // guard signal by the time beforeLoad runs.
  beforeLoad: () => {
    if (!useAuthStore.getState().user) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
