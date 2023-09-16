import {errors} from 'appium/driver';
import {
  cdpInfo, cdpList, cdpProtocol,
  cdpOpenTab, cdpActivateTab, cdpCloseTab,
  cdpInspector,
} from './atoms';
import { replaceDeep } from '../utils';

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 * @returns {import('../plugin').ProxiedSession}
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
 * @param {string} alias
 */
export async function cmdVersion(alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpInfo(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function cmdListAlias(...args) {
  return await cmdList.bind(this)(...args);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 */
export async function cmdList(alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpList(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 */
export async function cmdProtocol(alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpProtocol(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 */
export async function cmdOpenTab(alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  // FIXME: Plugins don't recognize request queries
  return replaceDeep(await cdpOpenTab(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 * @param {string} targetId
 */
export async function cmdActivateTab(targetId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpActivateTab(port, targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 * @param {string} targetId
 */
export async function cmdCloseTab(targetId, alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpCloseTab(port, targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} alias
 */
export async function cmdInspector(alias) {
  const {port, rewrites} = checkAlias.bind(this)(alias);
  return replaceDeep(await cdpInspector(port), rewrites);
}
