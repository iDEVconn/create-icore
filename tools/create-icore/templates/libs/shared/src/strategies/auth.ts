export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  role?: string;
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  setRole(uid: string, role: string): Promise<void>;
  getRole(uid: string): Promise<string | null>;
}
