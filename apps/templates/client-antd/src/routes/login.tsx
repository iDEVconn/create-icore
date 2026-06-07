import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { CheckEmailScreen } from '../components/auth/CheckEmailScreen';
import { LoginForm } from '../components/auth/LoginForm';
import { MagicLinkForm } from '../components/auth/MagicLinkForm';
import { RegisterForm } from '../components/auth/RegisterForm';

type Mode = 'login' | 'register' | 'magicLink' | 'checkEmail';

function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [checkEmail, setCheckEmail] = useState('');

  function handleRegisterSuccess(email: string) {
    setCheckEmail(email);
    setMode('checkEmail');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#020617' }}>
      <div style={{ flex: 1, display: 'none' }} className="auth-brand-lg">
        <AuthBrandPanel />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          {mode === 'login' && (
            <LoginForm
              onSwitchRegister={() => setMode('register')}
              onSwitchMagicLink={() => setMode('magicLink')}
            />
          )}
          {mode === 'register' && (
            <RegisterForm
              onSuccess={handleRegisterSuccess}
              onSwitchLogin={() => setMode('login')}
            />
          )}
          {mode === 'magicLink' && <MagicLinkForm onSwitchLogin={() => setMode('login')} />}
          {mode === 'checkEmail' && (
            <CheckEmailScreen email={checkEmail} onBack={() => setMode('login')} />
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
