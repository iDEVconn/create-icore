import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';

type Status = 'restoring' | 'done' | 'error';

function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<Status>('restoring');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userId = params.get('userId');
    const email = params.get('email');
    if (!accessToken || !refreshToken || !userId || !email) {
      setStatus('error');
      notify.error(t('auth.oauthCallbackMissingTokens'));
      void navigate({ to: '/login' });
      return;
    }
    setAuth({
      accessToken,
      refreshToken,
      user: { id: userId, email },
    });
    setStatus('done');
    void navigate({ to: '/_dashboard/dashboard' });
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {status === 'restoring' && (
          <>
            <Spin size="large" />
            <Typography.Text type="secondary">{t('auth.callbackVerifying')}</Typography.Text>
          </>
        )}
        {status === 'error' && (
          <Typography.Text type="danger">{t('auth.oauthFailed')}</Typography.Text>
        )}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/oauth/callback')({ component: OAuthCallbackPage });
