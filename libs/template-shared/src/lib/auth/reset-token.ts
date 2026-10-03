/** Token out of a reset-email landing URL: generic `token`, Supabase `token_hash`, or Firebase `oobCode`. */
export function resolveResetToken(params: URLSearchParams): string | null {
  return params.get('token') ?? params.get('token_hash') ?? params.get('oobCode') ?? null;
}
