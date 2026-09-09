import type { Readable } from 'node:stream';

export async function readBody(body: (Readable & { transformToString?: () => Promise<string> }) | undefined): Promise<string> {
  if (!body) return '';
  if (body.transformToString) return body.transformToString();

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
