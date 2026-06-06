import { Connection, Model, Schema } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  AuthStrategy,
  AuthSession,
  VerifiedToken,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
} from '@icore/shared';

export interface MongoDbAuthStrategyOptions {
  connection: Connection;
  jwtSecret: string;
  jwtExpiresIn?: string;
  refreshExpiresIn?: string;
}

export class MongoDbAuthStrategy implements AuthStrategy {
  private userModel: Model<{ id: string; email: string; passwordHash?: string; role?: string }>;
  private sessionModel: Model<{
    id: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
  }>;

  constructor(private readonly opts: MongoDbAuthStrategyOptions) {
    const userSchema = new Schema(
      {
        id: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        passwordHash: { type: String },
        role: { type: String },
      },
      { timestamps: true },
    );

    const sessionSchema = new Schema(
      {
        id: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        refreshToken: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
      },
      { timestamps: true },
    );

    this.userModel = this.opts.connection.model('User', userSchema);
    this.sessionModel = this.opts.connection.model('Session', sessionSchema);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const decoded = jwt.verify(token, this.opts.jwtSecret) as jwt.JwtPayload;
      return {
        uid: decoded.sub as string,
        email: decoded.email as string,
        role: decoded.role as string,
      };
    } catch (err) {
      throw new Error('invalid_token', { cause: err });
    }
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user || !user.passwordHash) throw new Error('invalid_credentials');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error('invalid_credentials');

    return this.createSession(user);
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) throw new Error('user_already_exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({
      id: randomUUID(),
      email,
      passwordHash,
    });

    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const session = await this.sessionModel.findOne({ refreshToken }).exec();
    if (!session || session.expiresAt < new Date()) {
      if (session) await this.sessionModel.deleteOne({ _id: session._id });
      throw new Error('invalid_refresh_token');
    }

    const user = await this.userModel.findOne({ id: session.userId }).exec();
    if (!user) throw new Error('user_not_found');

    await this.sessionModel.deleteOne({ _id: session._id });
    return this.createSession(user);
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.userModel.findOneAndUpdate({ id: uid }, { role }).exec();
  }

  async getRole(uid: string): Promise<string | null> {
    const user = await this.userModel.findOne({ id: uid }).exec();
    return user?.role || null;
  }

  async sendMagicLink(_req: MagicLinkRequest): Promise<void> {
    throw new Error('not_implemented');
  }

  async verifyMagicLink(_token: string): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  async startOAuth(_provider: OAuthProvider, _callbackUrl: string): Promise<OAuthStartResult> {
    throw new Error('not_implemented');
  }

  async completeOAuth(
    _provider: OAuthProvider,
    _code: string,
    _state: string,
  ): Promise<AuthSession> {
    throw new Error('not_implemented');
  }

  private async createSession(user: {
    id: string;
    email: string;
    role?: string;
  }): Promise<AuthSession> {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.opts.jwtSecret,
      { expiresIn: (this.opts.jwtExpiresIn as jwt.SignOptions['expiresIn']) || '15m' },
    );

    const refreshToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days

    await this.sessionModel.create({
      id: randomUUID(),
      userId: user.id,
      refreshToken,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 min
      user: { id: user.id, email: user.email },
    };
  }
}
