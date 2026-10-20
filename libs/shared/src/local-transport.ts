import { BaseRpcContext, ClientProxy, Server } from '@nestjs/microservices';
import type { CustomTransportStrategy, ReadPacket, WritePacket } from '@nestjs/microservices';

// In-process transport: the gateway's ClientProxy calls a microservice's @MessagePattern /
// @EventPattern handlers directly, inside the same process (a Cloudflare Worker has no TCP
// listener to put a real transport on). Servers register on a bus keyed by the transport prefix
// (AUTH, UPLOAD, …) — the same prefix `buildTransport(prefix)` uses — and clients look the server
// up on EVERY call, so a client may be created before its server starts and reacts to it closing.
const bus = new Map<string, LocalServer>();

export class LocalServer extends Server implements CustomTransportStrategy {
  constructor(private readonly prefix: string) {
    super();
  }

  listen(callback: () => void): void {
    bus.set(this.prefix, this);
    callback();
  }

  close(): void {
    // Only remove our own registration: a newer server may have replaced it under the same prefix.
    if (bus.get(this.prefix) === this) bus.delete(this.prefix);
  }

  on(): this {
    return this;
  }

  unwrap<T>(): T {
    return this as unknown as T;
  }
}

export interface LocalClientOptions {
  prefix: string;
}

export class LocalClientProxy extends ClientProxy {
  private readonly prefix: string;

  // `ClientsModule` instantiates a `customClass` with `new customClass(options)`.
  constructor(options: LocalClientOptions) {
    super();
    this.prefix = options.prefix;
  }

  async connect(): Promise<void> {
    /* in-process: nothing to connect */
  }

  close(): void {
    /* in-process: nothing to close */
  }

  unwrap<T>(): T {
    return this as unknown as T;
  }

  private resolve(pattern: unknown): {
    server: LocalServer;
    handler: NonNullable<ReturnType<Server['getHandlerByPattern']>>;
  } {
    const server = bus.get(this.prefix);
    if (!server) {
      throw new Error(`local transport: no server is listening for "${this.prefix}"`);
    }
    const handler = server.getHandlerByPattern(pattern as string);
    if (!handler) {
      throw new Error(
        `local transport: "${this.prefix}" has no handler for pattern ${JSON.stringify(pattern)}`,
      );
    }
    return { server, handler };
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const { handler } = this.resolve(packet.pattern);
    await handler(packet.data, new BaseRpcContext([packet.pattern]));
    return undefined as T;
  }

  protected publish(packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    // Structural type: `@icore/shared` does not depend on rxjs directly.
    let subscription: { unsubscribe(): void } | undefined;
    let cancelled = false;
    try {
      const { server, handler } = this.resolve(packet.pattern);
      Promise.resolve(handler(packet.data, new BaseRpcContext([packet.pattern])))
        .then((result) => server.transformToObservable(result))
        .then((stream$) => {
          if (cancelled) return;
          subscription = stream$.subscribe({
            next: (response) => callback({ response }),
            error: (err) => callback({ err }),
            complete: () => callback({ isDisposed: true }),
          });
        })
        .catch((err) => callback({ err }));
    } catch (err) {
      callback({ err });
    }
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }
}
