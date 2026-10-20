import { ClientProxy, Server } from '@nestjs/microservices';
import type { CustomTransportStrategy, ReadPacket, WritePacket } from '@nestjs/microservices';

// G0-only copy of the "local" in-process transport (the real one lands in PR 2 of the
// Workers phase). Servers register on a bus keyed by prefix; clients look them up by it.
const bus = new Map<string, LocalServer>();

export class LocalServer extends Server implements CustomTransportStrategy {
  constructor(private readonly prefix: string) {
    super();
  }
  listen(callback: () => void) {
    bus.set(this.prefix, this);
    callback();
  }
  close() {
    bus.delete(this.prefix);
  }
  on() {
    return this;
  }
  unwrap<T>(): T {
    return this as unknown as T;
  }
}

export class LocalClientProxy extends ClientProxy {
  constructor(private readonly prefix: string) {
    super();
  }
  async connect() {
    /* in-process: nothing to connect */
  }
  close() {
    /* in-process: nothing to close */
  }
  unwrap<T>(): T {
    return this as unknown as T;
  }
  protected async dispatchEvent<T = any>(packet: ReadPacket): Promise<T> {
    const handler = bus.get(this.prefix)?.getHandlerByPattern(packet.pattern as string);
    if (handler) await handler(packet.data, {});
    return undefined as T;
  }
  protected publish(packet: ReadPacket, callback: (p: WritePacket) => void): () => void {
    const server = bus.get(this.prefix);
    const handler = server?.getHandlerByPattern(packet.pattern as string);
    if (!server || !handler) {
      callback({ err: new Error(`no handler for ${String(packet.pattern)} on ${this.prefix}`) });
      return () => undefined;
    }
    Promise.resolve(handler(packet.data, {}))
      .then((result) => server.transformToObservable(result))
      .then((stream$) =>
        stream$.subscribe({
          next: (response) => callback({ response }),
          error: (err) => callback({ err }),
          complete: () => callback({ isDisposed: true }),
        }),
      )
      .catch((err) => callback({ err }));
    return () => undefined;
  }
}
