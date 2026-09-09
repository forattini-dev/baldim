interface PluginStorage {
  getPluginKey(namespace: string | null): string;
  list(prefix: string): Promise<string[]>;
}

export async function listPluginNamespaces(
  storage: PluginStorage | null,
  _pluginPrefix?: string,
): Promise<string[]> {
  if (!storage) return [];

  try {
    const baseKey = storage.getPluginKey(null);
    const keys = await storage.list(baseKey);
    const prefix = baseKey.endsWith('/') ? baseKey : `${baseKey}/`;
    const namespaces = new Set<string>();

    for (const key of keys) {
      const [namespace] = key.replace(prefix, '').split('/');
      if (namespace) namespaces.add(namespace);
    }

    return [...namespaces].sort();
  } catch {
    return [];
  }
}

export function getNamespacedResourceName(
  baseResourceName: string,
  namespace: string,
  _pluginPrefix?: string,
): string {
  return namespace ? baseResourceName.replace('plg_', `plg_${namespace}_`) : baseResourceName;
}
