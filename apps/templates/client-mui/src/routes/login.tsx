import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { CheckEmailScreen } from '../components/auth/CheckEmailScreen';
import { LoginForm } from '../components/auth/LoginForm';
import { MagicLinkForm } from '../components/auth/MagicLinkForm';
import { RegisterForm } from '../components/auth/RegisterForm';

type Mode = 'login' | 'register' | 'magicLink' | 'checkEmail';

function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [checkEmail, setCheckEmail] = useState('');
  const theme = useTheme();
  const isLg = useMediaQuery(theme.breakpoints.up('lg'));

  function handleRegisterSuccess(email: string) {
    setCheckEmail(email);
    setMode('checkEmail');
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: '#020617',
      }}
    >
      {isLg && <AuthBrandPanel />}

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: '40px 24px',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
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
        </Box>
      </Box>
    </Box>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
