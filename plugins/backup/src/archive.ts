import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

export type ArchiveCompression = 'none' | 'gzip' | 'brotli' | 'deflate';

export interface ArchiveEncryption {
  key: string;
  algorithm: string;
}

export interface ArchiveSourceFile {
  name: string;
  data: Buffer;
  text?: boolean;
}

export interface ArchiveFile {
  name: string;
  size: number;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface BackupArchive {
  version: string;
  created: string;
  files: ArchiveFile[];
}

interface EncryptionEnvelope {
  version: 1;
  encrypted: true;
  algorithm: string;
  iv: string;
  authTag: string;
  data: string;
}

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

async function compress(data: Buffer, compression: ArchiveCompression): Promise<Buffer> {
  if (compression === 'gzip') return gzip(data, { level: 6 });
  if (compression === 'brotli') return brotliCompress(data);
  if (compression === 'deflate') return deflate(data);
  return data;
}

async function decompress(data: Buffer, compression: ArchiveCompression): Promise<Buffer> {
  if (compression === 'gzip') return gunzip(data);
  if (compression === 'brotli') return brotliDecompress(data);
  if (compression === 'deflate') return inflate(data);
  return data;
}

function deriveKey(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function encrypt(data: Buffer, config: ArchiveEncryption): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(config.algorithm, deriveKey(config.key), iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const envelope: EncryptionEnvelope = {
    version: 1,
    encrypted: true,
    algorithm: config.algorithm,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

function decrypt(data: Buffer, config: ArchiveEncryption): Buffer {
  const envelope = JSON.parse(data.toString('utf8')) as Partial<EncryptionEnvelope>;
  if (!envelope.encrypted || !envelope.algorithm || !envelope.iv || !envelope.authTag || !envelope.data) {
    throw new Error('Invalid encrypted backup envelope');
  }
  const decipher = crypto.createDecipheriv(
    envelope.algorithm,
    deriveKey(config.key),
    Buffer.from(envelope.iv, 'base64')
  ) as crypto.DecipherGCM;
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final()
  ]);
}

export async function writeBackupArchive(
  targetPath: string,
  files: ArchiveSourceFile[],
  compression: ArchiveCompression,
  encryption: ArchiveEncryption | null
): Promise<void> {
  const archive: BackupArchive = {
    version: '2.0',
    created: new Date().toISOString(),
    files: files.map(file => ({
      name: file.name,
      size: file.data.byteLength,
      content: file.text ? file.data.toString('utf8') : file.data.toString('base64'),
      encoding: file.text ? 'utf8' : 'base64'
    }))
  };
  let data = await compress(Buffer.from(JSON.stringify(archive), 'utf8'), compression);
  if (encryption) data = encrypt(data, encryption);
  await writeFile(targetPath, data);
}

export async function readBackupArchive(
  sourcePath: string,
  compression: ArchiveCompression,
  encryption: ArchiveEncryption | null
): Promise<BackupArchive> {
  let data: Buffer<ArrayBufferLike> = await readFile(sourcePath);
  if (encryption) data = decrypt(data, encryption);
  data = await decompress(data, compression);
  const archive = JSON.parse(data.toString('utf8')) as BackupArchive;
  if (!archive || typeof archive !== 'object' || !archive.version || !Array.isArray(archive.files)) {
    throw new Error('Invalid backup archive format');
  }
  return archive;
}

export function decodeArchiveFile(file: ArchiveFile): Buffer {
  return Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
}
