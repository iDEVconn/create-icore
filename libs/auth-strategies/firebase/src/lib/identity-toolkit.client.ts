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
  signInWithIdp(opts: {
    requestUri: string;
    postBody: string;
  }): Promise<IdentityToolkitSignInResponse>;
}

export interface OAuthTokenExchangeResult {
  idToken?: string;
  accessToken?: string;
  email: string;
}

export interface OAuthTokenClient {
  exchange(
    provider: 'google' | 'github',
    opts: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<OAuthTokenExchangeResult>;
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

  async signInWithIdp(opts: {
    requestUri: string;
    postBody: string;
  }): Promise<IdentityToolkitSignInResponse> {
    return this.post<IdentityToolkitSignInResponse>(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp',
      { requestUri: opts.requestUri, postBody: opts.postBody, returnSecureToken: true },
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

export class HttpOAuthTokenClient implements OAuthTokenClient {
  async exchange(
    provider: 'google' | 'github',
    opts: { code: string; clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<OAuthTokenExchangeResult> {
    if (provider === 'google') return this.exchangeGoogle(opts);
    return this.exchangeGithub(opts);
  }

  private async exchangeGoogle(opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<OAuthTokenExchangeResult> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: opts.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error(`google_token_exchange_failed_${res.status}`);
    const data = (await res.json()) as { id_token: string; access_token: string };
    // Google's id_token is a JWT; parse the email claim out of the payload.
    const [, payloadB64] = data.id_token.split('.');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as {
      email: string;
    };
    return { idToken: data.id_token, accessToken: data.access_token, email: claims.email };
  }

  private async exchangeGithub(opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<OAuthTokenExchangeResult> {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error(`github_token_exchange_failed_${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const userRes = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${access_token}`, accept: 'application/json' },
    });
    if (!userRes.ok) throw new Error(`github_user_lookup_failed_${userRes.status}`);
    const profile = (await userRes.json()) as { email: string | null; login: string };
    // GitHub may withhold email if user kept it private; fall back to noreply.
    const email = profile.email ?? `${profile.login}@users.noreply.github.com`;
    return { accessToken: access_token, email };
  }
}
