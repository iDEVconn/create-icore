export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)icore_csrf=([^;]+)/);
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}
