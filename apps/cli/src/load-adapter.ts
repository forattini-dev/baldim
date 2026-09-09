export async function loadOfficialAdapter(connectionString: string): Promise<void> {
  const protocol = new URL(connectionString).protocol.slice(0, -1).toLowerCase();

  if (protocol === 'memory') await import('@baldin/adapter-memory');
  else if (protocol === 'file') await import('@baldin/adapter-filesystem');
  else if (protocol === 'reddb') await import('@baldin/adapter-reddb');
  else if (protocol === 'sqlite' || protocol === 'sqlite+libsql' || protocol === 'sqlite+d1') {
    await import('@baldin/adapter-sqlite');
  } else if (protocol === 's3' || protocol === 'http' || protocol === 'https') {
    await import('@baldin/adapter-s3');
  }
}
