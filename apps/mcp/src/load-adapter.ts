export async function loadOfficialAdapter(connectionString: string): Promise<void> {
  const protocol = new URL(connectionString).protocol.slice(0, -1).toLowerCase();

  if (protocol === 'memory') await import('@baldim/adapter-memory');
  else if (protocol === 'file') await import('@baldim/adapter-filesystem');
  else if (protocol === 'reddb') await import('@baldim/adapter-reddb');
  else if (protocol === 'sqlite' || protocol === 'sqlite+libsql' || protocol === 'sqlite+d1') {
    await import('@baldim/adapter-sqlite');
  } else if (protocol === 's3' || protocol === 'http' || protocol === 'https') {
    await import('@baldim/adapter-s3');
  }
}
