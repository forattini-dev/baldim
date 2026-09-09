import { PluginError } from '@baldim/core/plugin';

export async function loadOptionalDependency<T>(packageName: string, feature: string): Promise<T> {
  try {
    const module = await import(packageName);
    return (module.default || module) as T;
  } catch (cause) {
    throw new PluginError(`${feature} requires the optional dependency ${packageName}`, {
      pluginName: 'IdentityPlugin',
      operation: 'loadOptionalDependency',
      statusCode: 500,
      retriable: false,
      suggestion: `Install ${packageName} to enable ${feature}.`,
      cause,
    });
  }
}
