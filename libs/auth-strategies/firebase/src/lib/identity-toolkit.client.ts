export interface IdentityToolkitSignUpResponse {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface IdentityToolkitSignInResponse extends IdentityToolkitSignUpResponse {
  registered: boolean;
}

export interface IdentityToolkitRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

export interface IdentityToolkitClient {
  signUp(email: string, password: string): Promise<IdentityToolkitSignUpResponse>;
  signIn(email: string, password: string): Promise<IdentityToolkitSignInResponse>;
  refresh(refreshToken: string): Promise<IdentityToolkitRefreshResponse>;
  sendOobCode(opts: { email: string; continueUrl: string }): Promise<void>;
  signInWithEmailLink(opts: {
    email: string;
    oobCode: string;
  }): Promise<IdentityToolkitSignInResponse>;
}

interface IdentityToolkitError {
  error?: { message?: string; code?: number };
}

export class HttpIdentityToolkitClient implements IdentityToolkitClient {
  constructor(private readonly apiKey: string) {}

  async signUp(email: string, password: string): Promise<IdentityToolkitSignUpResponse> {
    return this.post<IdentityToolkitSignUpResponse>(
      'https://identitytoolkit.googleapis.com/v1/accounts:signUp',
      { email, password, returnSecureToken: true },
    );
  }

  async signIn(email: string, password: string): Promise<IdentityToolkitSignInResponse> {
    return this.post<IdentityToolkitSignInResponse>(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      { email, password, returnSecureToken: true },
    );
  }

  async sendOobCode(opts: { email: string; continueUrl: string }): Promise<void> {
    await this.post<unknown>('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', {
      requestType: 'EMAIL_SIGNIN',
      email: opts.email,
      continueUrl: opts.continueUrl,
    });
  }

  async signInWithEmailLink(opts: {
    email: string;
    oobCode: string;
  }): Promise<IdentityToolkitSignInResponse> {
    return this.post<IdentityToolkitSignInResponse>(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink',
      { email: opts.email, oobCode: opts.oobCode },
    );
  }

  async refresh(refreshToken: string): Promise<IdentityToolkitRefreshResponse> {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as IdentityToolkitError;
      throw new Error(payload.error?.message ?? `firebase_refresh_failed_${res.status}`);
    }
    return res.json() as Promise<IdentityToolkitRefreshResponse>;
  }

  private async post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${url}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as IdentityToolkitError;
      throw new Error(payload.error?.message ?? `firebase_request_failed_${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}
