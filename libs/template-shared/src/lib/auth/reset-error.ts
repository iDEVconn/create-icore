import { ApiError } from '../api/create-api';

export type ResetErrorKind = 'invalidToken' | 'weakPassword' | 'other';

/** Classifies a failed `POST /auth/password/reset` so the UI can say the right thing. */
export function resolveResetError(err: unknown): ResetErrorKind {
  if (!(err instanceof ApiError) || err.status !== 400) return 'other';
  const message = (err.body as { message?: unknown } | null)?.message;
  return message === 'weak_password' || message === 'password_too_short'
    ? 'weakPassword'
    : 'invalidToken';
}

export const RESET_ERROR_KEYS: Record<ResetErrorKind, string> = {
  invalidToken: 'auth.resetPasswordInvalidToken',
  weakPassword: 'auth.resetPasswordWeak',
  other: 'auth.resetPasswordRetryHint',
};
