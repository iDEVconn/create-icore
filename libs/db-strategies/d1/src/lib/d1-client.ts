export type D1Param = string | number | null;

export interface D1QueryResult<T> {
  rows: T[];
  changes: number;
}

export interface D1ClientLike {
  query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<D1QueryResult<T>>;
}

export class D1ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly codes: number[] = [],
  ) {
    super(message);
    this.name = 'D1ApiError';
  }
}

export interface D1RestClientOptions {
  accountId: string;
  databaseId: string;
  apiToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface D1Envelope {
  success?: boolean;
  errors?: { code: number; message: string }[];
  result?: { results?: unknown[]; meta?: { changes?: number } }[];
}

const RETRYABLE_STATUS = new Set([429, 503]);
const BASE_BACKOFF_MS = 250;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return BASE_BACKOFF_MS * 2 ** attempt;
}

export function createD1RestClient(opts: D1RestClientOptions): D1ClientLike {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRetries = opts.maxRetries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;

  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: D1Param[] = [],
    ): Promise<D1QueryResult<T>> {
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await doFetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${opts.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql, params }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          // A timed-out request may already have been applied, so only
          // errors that happened before any response are retried.
          if (!isTimeout(err) && attempt < maxRetries) {
            await sleep(backoffMs(attempt, null));
            continue;
          }
          throw err;
        }

        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          await sleep(backoffMs(attempt, res.headers.get('Retry-After')));
          continue;
        }

        const body = (await res.json().catch(() => ({}))) as D1Envelope;
        if (!res.ok || body.success === false) {
          const errors = body.errors ?? [];
          throw new D1ApiError(
            errors.map((e) => e.message).join('; ') || `D1 request failed (${res.status})`,
            res.status,
            errors.map((e) => e.code),
          );
        }
        const first = body.result?.[0];
        return {
          rows: (first?.results ?? []) as T[],
          changes: first?.meta?.changes ?? 0,
        };
      }
    },
  };
}
