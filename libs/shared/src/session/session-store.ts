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
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllForUser(uid: string): Promise<void>;
  withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
