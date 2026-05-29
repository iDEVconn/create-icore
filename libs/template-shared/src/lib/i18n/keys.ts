export const ICORE_LOCALES = {
  en: {
    common: {
      loading: 'Loading…',
      save: 'Save',
      cancel: 'Cancel',
      logout: 'Log out',
    },
    auth: {
      email: 'Email',
      password: 'Password',
      login: 'Log in',
      register: 'Sign up',
      switchToLogin: 'Have an account? Log in',
      switchToRegister: 'No account yet? Sign up',
      withPassword: 'With password',
      withMagicLink: 'Magic link',
      sendMagicLink: 'Send link',
      magicLinkSent: 'Check your email',
      magicLinkSentDescription: 'We sent a sign-in link to {{email}}.',
      magicLinkUseDifferentEmail: 'Use a different email',
      callbackVerifying: 'Verifying…',
      callbackFailed: 'Verification failed',
      callbackMissingToken: 'Missing magic-link token',
    },
    nav: {
      dashboard: 'Dashboard',
      profile: 'Profile',
    },
    profile: {
      title: 'Profile',
      hint: 'Edit your account details.',
    },
    error: {
      accessDenied: 'Access denied',
      unknown: 'Something went wrong.',
    },
  },
} as const;
