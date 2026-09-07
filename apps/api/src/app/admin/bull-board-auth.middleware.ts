import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthClientService } from '@icore/auth-client';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  constructor(@Inject(AuthClientService) private readonly authClient: AuthClientService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ message: 'unauthorized' });
      return;
    }

    try {
      const verified = await this.authClient.verify(token);
      if (verified.role !== 'admin') {
        res.status(403).json({ message: 'forbidden' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ message: 'unauthorized' });
    }
  }
}
