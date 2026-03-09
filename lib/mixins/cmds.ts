import {errors} from 'appium/driver';
import type { Request } from 'express';
import {
  cdpInfo, cdpList, cdpProtocol,
  cdpOpenTab, cdpActivateTab, cdpCloseTab,
  cdpInspector,
} from './atoms';
import { replaceDeep } from '../utils';
import type { DevtoolsPlugin } from '../plugin';
import type { ProxiedSession } from '../types';

function checkAlias(this: DevtoolsPlugin, alias: string): ProxiedSession {
  if (!(alias in this.proxiedSessions)) {
    throw new errors.UnknownCommandError(
      `The target with alias '${alias}' is not being proxied. ` +
      `Make sure to invoke 'proxyTarget' beforehand`
    );
  }
  return this.proxiedSessions[alias];
}

/**
 * Returns version information for a proxied DevTools target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias in params
 * @returns Version information with rewritten URLs
 */
export async function cmdVersion(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpInfo(port), rewrites);
}

/**
 * Returns the list of available DevTools targets for a proxied session with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias in params
 * @returns List of target information with rewritten URLs
 */
export async function cmdList(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>[]> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpList(port), rewrites);
}

/**
 * Returns the Chrome DevTools Protocol schema for a proxied target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias in params
 * @returns Protocol schema with rewritten URLs
 */
export async function cmdProtocol(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpProtocol(port), rewrites);
}

/**
 * Opens a new tab in a proxied DevTools target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias in params and optional URL in query
 * @returns Information about the newly created tab with rewritten URLs
 */
export async function cmdOpenTab(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  const firstQueryKey = Object.keys(req.query)[0] ?? null;
  return replaceDeep(await cdpOpenTab(port, firstQueryKey), rewrites);
}

/**
 * Activates a specific tab in a proxied DevTools target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias and targetId in params
 * @returns Result of the activation operation with rewritten URLs
 */
export async function cmdActivateTab(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  const targetId = Array.isArray(req.params.targetId) ? req.params.targetId[0] : req.params.targetId;
  return replaceDeep(await cdpActivateTab(port, targetId), rewrites);
}

/**
 * Closes a specific tab in a proxied DevTools target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias and targetId in params
 * @returns Result of the close operation with rewritten URLs
 */
export async function cmdCloseTab(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  const targetId = Array.isArray(req.params.targetId) ? req.params.targetId[0] : req.params.targetId;
  return replaceDeep(await cdpCloseTab(port, targetId), rewrites);
}

/**
 * Returns the DevTools inspector HTML page for a proxied target with URL rewrites applied.
 *
 * @this {DevtoolsPlugin}
 * @param req - Express request object containing the target alias in params
 * @returns The HTML content of the DevTools inspector page with rewritten URLs
 */
export async function cmdInspector(this: DevtoolsPlugin, req: Request): Promise<Record<string, any>> {
  const {port, rewrites} = checkAlias.bind(this)(req.params.alias);
  return replaceDeep(await cdpInspector(port), rewrites);
}
