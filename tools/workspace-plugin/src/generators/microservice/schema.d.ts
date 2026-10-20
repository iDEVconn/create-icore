export type MicroserviceTransport = 'tcp' | 'redis' | 'nats' | 'mqtt' | 'rmq' | 'kafka';

export interface MicroserviceGeneratorSchema {
  name: string;
  transport?: MicroserviceTransport;
  port?: number;
  inspectPort?: number;
  skipBff?: boolean;
  withDb?: boolean;
  withDocker?: boolean;
  tags?: string;
}
