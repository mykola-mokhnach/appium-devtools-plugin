import {errors} from 'appium/driver';
import {
  cdpInfo, cdpList, cdpProtocol,
  cdpOpenTab, cdpActivateTab, cdpCloseTab,
  cdpInspector,
} from './atoms';
import { replaceDeep } from '../utils';

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
function checkAlias(alias) {
  if (!(alias in this.proxiedSessions)) {
    throw new errors.UnknownCommandError(
      `The target with alias '${alias}' is not being proxied. ` +
      `Make sure to invoke 'proxyTarget' beforehand`
    );
  }
  return this.proxiedSessions[alias];
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdVersion(sessionId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpInfo(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdListAlias(sessionId, alias) {
  return await cmdList.bind(this)(sessionId, alias);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdList(sessionId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpList(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdProtocol(sessionId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpProtocol(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdOpenTab(sessionId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  // FIXME: Plugins don't recognize request queries
  return replaceDeep(await cdpOpenTab(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdActivateTab(sessionId, alias, targetId) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpActivateTab(port, targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdCloseTab(sessionId, alias, targetId) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpCloseTab(port, targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdInspector(sessionId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpInspector(port), rewrites);
}
