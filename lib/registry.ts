import type { DevtoolsPlugin } from './plugin';

export const PLUGIN_INSTANCES = new Set<WeakRef<DevtoolsPlugin>>();

/**
 * @param plugin
 */
export function registerPlugin(plugin: DevtoolsPlugin): void {
  PLUGIN_INSTANCES.add(new WeakRef(plugin));
}

/**
 * @param uuid
 * @returns
 */
export function findPlugin(uuid: string): DevtoolsPlugin | null {
  let result: DevtoolsPlugin | null = null;
  const expiredRefs: WeakRef<DevtoolsPlugin>[] = [];
  for (const instanceRef of PLUGIN_INSTANCES) {
    const instance = instanceRef.deref();
    if (!instance) {
      expiredRefs.push(instanceRef);
    } else if (!result && uuid === instance.uuid) {
      result = instance;
    }
  }
  for (const expiredRef of expiredRefs) {
    PLUGIN_INSTANCES.delete(expiredRef);
  }
  return result;
}
