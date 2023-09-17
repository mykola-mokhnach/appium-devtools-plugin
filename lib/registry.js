
/** @type {Set<WeakRef<import('./plugin').DevtoolsPlugin>>} */
export const PLUGIN_INSTANCES = new Set();

/**
 * @param {import('./plugin').DevtoolsPlugin} plugin
 */
export function registerPlugin(plugin) {
  // eslint-disable-next-line no-undef
  PLUGIN_INSTANCES.add(new WeakRef(plugin));
}

/**
 * @param {string} uuid
 * @returns {import('./plugin').DevtoolsPlugin?}
 */
export function findPlugin(uuid) {
  let result = null;
  const expiredRefs = [];
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
