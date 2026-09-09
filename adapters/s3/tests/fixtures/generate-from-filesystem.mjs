import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '../../../filesystem/tests/fixtures/s3db-v21-filesystem/compat');
const output = path.join(directory, 's3db-v21-objects.json');
const objects = [];

async function visit(current) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
      continue;
    }
    if (entry.name.endsWith('.meta.json')) continue;

    const metadataPath = `${absolute}.meta.json`;
    const stored = JSON.parse(await readFile(metadataPath, 'utf8'));
    objects.push({
      key: path.relative(source, absolute).split(path.sep).join('/'),
      bodyBase64: (await readFile(absolute)).toString('base64'),
      metadata: stored.metadata || {},
      contentType: stored.contentType || 'application/octet-stream'
    });
  }
}

await visit(source);
await writeFile(output, `${JSON.stringify({
  sourceCommit: '8264a009ce46b6f5b6e8a30a8916e9608fbffc11',
  sourceVersion: '21.6.2',
  objects
}, null, 2)}\n`);
