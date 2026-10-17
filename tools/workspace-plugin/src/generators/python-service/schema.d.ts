export type PythonServiceFramework = 'fastapi' | 'grpc';

export interface PythonServiceGeneratorSchema {
  name: string;
  framework?: PythonServiceFramework;
  port?: number;
  uvWorkspace?: boolean;
  skipBff?: boolean;
  tags?: string;
}
