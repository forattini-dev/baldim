declare module 'redblue-cli' {
  export function createClient(options?: Record<string, unknown>): Promise<unknown>;
  const defaultExport: { createClient?: typeof createClient };
  export default defaultExport;
}
