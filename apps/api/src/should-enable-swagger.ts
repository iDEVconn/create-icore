export function shouldEnableSwagger(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
