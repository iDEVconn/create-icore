import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { formatEnvBanner, verifyHmac } from '@icore/shared';

let warnedMissingSecret = false;

/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send). AUTH_TCP_SECRET missing crashes boot in production
 * (same missingEnv/formatEnvBanner convention as MS strategy factories); in
 * dev it prints one banner and lets requests through unsigned.
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

    delete data['_sig'];
    if (!verifyHmac(data, sig, secret)) throw new RpcException('invalid_signature');

    return true;
  }
}
