import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { readSessionId, type SessionStore } from '@icore/shared';
import { SESSION_STORE } from '../session/session-store.provider';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Admin gate for the bull-board UI.
 *
 * The board is mounted as a raw Express router, so it never passes through
 * the Nest guard pipeline (`AuthGuard`/`CsrfGuard` never see it) and has to
 * repeat the checks itself. Under the BFF model the browser has no Bearer
 * token to send any more — identity is the `icore_sid` cookie resolved
 * against the session store, exactly like `AuthGuard` does it.
 */
@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  constructor(@Inject(SESSION_STORE) private readonly sessionStore: SessionStore) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Cookie auth means the board's own mutating endpoints (retry/promote/
    // clean a job) would otherwise be reachable cross-site with an admin's
    // ambient cookie — something the old Bearer-header check made impossible.
    // The global CsrfGuard cannot help here (raw Express, no guard pipeline)
    // and bull-board's bundled UI can't be made to send X-CSRF-Token, so use
    // the header browsers DO always attach to a cross-site mutating request.
    if (!SAFE_METHODS.has(req.method) && isCrossOrigin(req)) {
      res.status(403).json({ message: 'forbidden' });
      return;
    }

    const sessionId = readSessionId(req);
    if (!sessionId) {
      res.status(401).json({ message: 'unauthorized' });
      return;
    }

    let record;
    try {
      record = await this.sessionStore.get(sessionId);
    } catch {
      // Mirrors AuthGuard: a session-store outage is "try again", not
      // "you are not allowed".
      res.status(503).json({ message: 'session_store_unavailable' });
      return;
    }

    if (!record) {
      res.status(401).json({ message: 'unauthorized' });
      return;
    }
    if (record.role !== 'admin') {
      res.status(403).json({ message: 'forbidden' });
      return;
    }
    next();
  }
}

function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return false; // same-origin requests may omit Origin entirely
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true; // unparseable Origin — treat as hostile
  }
}
