import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { formatEnvBanner, verifyHmac } from '@icore/shared';

let warnedMissingSecret = false;

// How much clock drift between gateway and auth MS (plus network latency) to
// tolerate before treating a signed request as expired/replayed. 30s is
// generous for same-datacenter traffic and small enough that a captured
// request has a narrow window to be replayed in.
const MAX_CLOCK_SKEW_MS = 30_000;

/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send), plus a signed timestamp (`_ts`) to reject replayed
 * requests outside a clock-skew tolerance window. In production
 * (NODE_ENV=production), an unset/empty AUTH_TCP_SECRET causes per-request
 * rejection at runtime via canActivate, resulting in 100% traffic failure
 * (not a boot crash). Outside production, it logs one warning and lets
 * requests through unsigned.
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) {
      const banner = formatEnvBanner({
        service: 'auth HMAC guard',
        provider: 'AUTH_TCP_SECRET',
        missing: ['AUTH_TCP_SECRET'],
        envPath: 'apps/microservices/auth/.env',
        headline: '⚠  auth HMAC guard — request signatures are NOT being verified',
      });
      if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
      if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        console.warn(banner);
      }
      return true;
    }

    const data = context.switchToRpc().getData() as Record<string, unknown>;
    const sig = data['_sig'];
    if (typeof sig !== 'string') throw new RpcException('missing_signature');
    const ts = data['_ts'];
    if (typeof ts !== 'number') throw new RpcException('missing_timestamp');

    const signedPayload = { ...data };
    delete signedPayload['_sig'];
    if (!verifyHmac(signedPayload, sig, secret)) throw new RpcException('invalid_signature');

    if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
      throw new RpcException('signature_expired');
    }

    delete data['_sig'];
    delete data['_ts'];
    return true;
  }
}
