/** Body of `POST /auth/register`: 202 when the provider wants the email confirmed first, 201 `{ user }` otherwise. */
export type RegisterResponse =
  | { status: 'confirmation_required'; email: string }
  | { user: { id: string; email: string; role?: string } };

export function isConfirmationRequired(
  res: RegisterResponse,
): res is { status: 'confirmation_required'; email: string } {
  return 'status' in res && res.status === 'confirmation_required';
}
