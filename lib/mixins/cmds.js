import {errors} from 'appium/driver';
import _ from 'lodash';
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
 * @param {import('express').Request} req
 */
export async function cmdVersion(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpInfo(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdList(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpList(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdProtocol(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpProtocol(port), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdOpenTab(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpOpenTab(port, _.keys(req.query)[0]), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdActivateTab(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpActivateTab(port, req.params.targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdCloseTab(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpCloseTab(port, req.params.targetId), rewrites);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {import('express').Request} req
 */
export async function cmdInspector(req) {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpInspector(port), rewrites);
}
