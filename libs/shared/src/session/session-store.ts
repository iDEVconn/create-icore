export interface SessionRecord {
  sessionId: string;
  uid: string;
  email: string;
  role?: string;
  providerAccessToken: string;
  providerRefreshToken: string;
  providerAccessTokenExpiresAt: number;
  createdAt: number;
  lastRefreshedAt: number;
}

export type NewSessionRecord = Omit<SessionRecord, 'sessionId' | 'createdAt' | 'lastRefreshedAt'>;

export interface SessionStore {
  create(record: NewSessionRecord): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  /**
   * Patches a session. Resolves `false` (and writes nothing) when the session
   * no longer exists — a concurrent logout / admin revoke wins — so the caller
   * can clean up whatever it just minted for it.
   */
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<boolean>;
  /**
   * Deletes a session and returns the record AS IT WAS AT THE MOMENT OF
   * DELETION (atomically — never a stale earlier read), or null if it did not
   * exist. Callers revoke `record.providerRefreshToken` at the provider; a
   * stale one (rotated by a refresh landing in between) would leave the new
   * provider session alive.
   */
  delete(sessionId: string): Promise<SessionRecord | null>;
  /** Like `delete`, for every session of a user: the returned records are the ones actually deleted. */
  deleteAllForUser(uid: string): Promise<SessionRecord[]>;
  withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
