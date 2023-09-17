import _ from 'lodash';
import {util} from 'appium/support';
import {findAPortNotInUse, checkPortStatus} from 'portscanner';
import B from 'bluebird';
import {
  toSocketNameAlias, fetchInterfaces,
  V4_BROADCAST_IP, V6_BROADCAST_IP
} from '../utils';
import WebSocket from 'ws';
import {CDP_METHODS_ROOT} from '../constants';
import { cdpInfo, cdpList } from './atoms';

const DEVTOOLS_SOCKET_PATTERN = /@[\w.]+_devtools_remote.*/;
// TODO: Make it configurable
const DEVTOOLS_LOOKUP_PORTS_RANGE = [12900, 13000];
const DEVTOOLS_BIND_PORTS_RANGE = [15900, 16000];
const DEBUGGER_URL_KEY = 'webSocketDebuggerUrl';
const WS_SERVER_ERROR = 1011;
const WS_SERVER_POLICY_VIOLATION = 1008;
const WS_ENTITY_ID_PATTERN = /\/devtools\/(browser|page)\/([a-fA-F0-9-]+)/;

/**
 * @typedef {Object} RequiredProperties
 * @property {any} adb
 * @property {import('@appium/types').AppiumServer} server
 */

/**
 * @param {import('appium/driver').BaseDriver?} [driver]
 * @returns {RequiredProperties}
 */
function requireDriverProperties(driver) {
  const result = {};
  for (const propName of ['adb', 'server']) {
    if (!driver?.[propName]) {
      throw new Error(
        `The driver '${driver?.constructor.name}' does not have the required '${propName}' property. ` +
        'Is it a valid Android driver?'
      );
    }
    result[propName] = driver[propName];
  }
  // @ts-ignore The properties should be assigned above
  return result;
}

/**
 * This function gets a list of android system processes and returns ones
 * that look like webviews
 * See https://cs.chromium.org/chromium/src/chrome/browser/devtools/device/android_device_info_query.cc
 * for more details
 *
 * @this {import('../plugin').DevtoolsPlugin}
 * @return {Promise<string[]>} - a list of matching webview socket names (including the leading '@')
 */
async function getCandidateSocketNames() {
  const {adb} = requireDriverProperties(this.driver);
  this.logger.debug('Getting a list of candidate devtools sockets');
  const out = await adb.shell(['cat', '/proc/net/unix']);
  const names = [];
  const allMatches = [];
  for (const line of out.split('\n')) {
    // Num RefCount Protocol Flags Type St Inode Path
    const [, , , flags, , st, , sockPath] = line.trim().split(/\s+/);
    if (!sockPath) {
      continue;
    }
    if (sockPath.startsWith('@')) {
      allMatches.push(line.trim());
    }
    if (flags !== '00010000' || st !== '01') {
      continue;
    }
    if (!DEVTOOLS_SOCKET_PATTERN.test(sockPath)) {
      continue;
    }

    names.push(sockPath);
  }
  if (_.isEmpty(names)) {
    this.logger.debug('Found no active devtools sockets');
    if (!_.isEmpty(allMatches)) {
      this.logger.debug(`Other sockets are: ${JSON.stringify(allMatches, null, 2)}`);
    }
  } else {
    this.logger.debug(
      `Parsed ${names.length} active devtools ${util.pluralize('socket', names.length, false)}: ` +
        JSON.stringify(names)
    );
  }
  // sometimes the webview process shows up multiple times per app
  return _.uniq(names);
}

/**
 * @typedef {Object} WebviewProps
 * @property {Record<string, any>} info The output of /json/version CDP endpoint
 * @property {Record<string, any>[]} pages The output of /json/list CDP endpoint
 */

/**
 * This is a wrapper for Chrome Debugger Protocol data collection.
 * No error is thrown if CDP request fails - in such case no data will be
 * recorded into the corresponding `webviewsMapping` item.
 *
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string} socketName
 * @param {number} localPort
 * @returns {Promise<WebviewProps>}
 */
async function collectSingleDetails(socketName, localPort) {
  this.logger.debug(`Collecting CDP data of '${socketName}'`);
  const [info, pages] = await B.all([cdpInfo(localPort), cdpList(localPort)]);
  this.logger.info(`Collected CDP details of '${socketName}'`);
  return {info, pages};
}

/**
 * This is a wrapper for Chrome Debugger Protocol data collection.
 * No error is thrown if CDP request fails - in such case no data will be
 * recorded into the corresponding `webviewsMapping` item.
 *
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string[]} socketNames
 * @returns {Promise<Record<string, WebviewProps>>}
 */
async function collectMultipleDetails(socketNames) {
  const {adb} = requireDriverProperties(this.driver);
  if (_.isEmpty(socketNames)) {
    return {};
  }

  /** @type {Record<string, WebviewProps>} */
  const details = {};
  // Connect to each devtools socket and retrieve web view details
  this.logger.debug(`Collecting CDP data of ${util.pluralize('candidate webview', socketNames.length, true)}`);
  const [startPort, endPort] = DEVTOOLS_LOOKUP_PORTS_RANGE;
  let localPort;
  try {
    localPort = await findAPortNotInUse(startPort, endPort);
  } catch (e) {
    throw new Error(
      `Cannot find any free port to forward candidate Devtools sockets ` +
      `in range ${startPort}..${endPort}`
    );
  }
  for (const socketName of socketNames) {
    const remotePort = socketName.replace(/^@/, '');
    try {
      await adb.adbExec(['forward', `tcp:${localPort}`, `localabstract:${remotePort}`]);
    } catch (e) {
      this.logger.debug(
        `Could not create a port forward to fetch the details of '${socketName}' socket: ${e.message}`
      );
      continue;
    }

    try {
      details[socketName] = await collectSingleDetails.bind(this)(socketName, localPort);
    } catch (e) {
      this.logger.debug(`Could not fetch the CDP details of '${socketName}' socket: ${e.message}`);
    } finally {
      try {
        await adb.removePortForward(localPort);
      } catch (e) {
        this.logger.debug(e.message);
      }
    }
  }
  this.logger.info(`Collected CDP details of ${util.pluralize('webview', _.size(details), true)}`);
  return details;
}

/**
 * @typedef {Object} DevtoolsTarget
 * @property {Record<string, any>} info
 * @property {Record<string, any>[]} pages
 * @property {string} name
 * @property {boolean} isProxied
 * @property {import('../plugin').ProxyInfo?} [proxyInfo]
 */

/**
 * @typedef {Object} DevtoolsTargetsInfo
 * @property {DevtoolsTarget[]} targets
 */


/**
 *
 * @param {import('../plugin').ProxiedSession} proxySession
 * @returns {import('../plugin').ProxyInfo}
 */
function toProxyInfo(proxySession) {
  return _.pick(proxySession, 'alias', 'name', 'root');
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @return {Promise<DevtoolsTargetsInfo>}
 */
export async function listDevtoolsTargets () {
  const socketNames = await getCandidateSocketNames.bind(this)();
  const webviewsMapping = await collectMultipleDetails.bind(this)(socketNames);
  const targets = _.toPairs(webviewsMapping)
    .map(([name, {pages, info}]) => {
      const alias = toSocketNameAlias(name);
      const isProxied = alias in this.proxiedSessions;
      return {
        name,
        pages,
        info,
        isProxied,
        proxyInfo: isProxied ? toProxyInfo(this.proxiedSessions[alias]) : null,
      };
    });
  return {targets};
}

/**
 *
 * @param {string} pathname
 * @returns {string?}
 */
function extractWsEntityId (pathname) {
  const match = WS_ENTITY_ID_PATTERN.exec(pathname);
  return match ? match[2] : null;
}

/**
 *
 * @param {string} rawServerHost
 * @returns {string}
 */
function toServerHost (rawServerHost) {
  if (![V4_BROADCAST_IP, V6_BROADCAST_IP, `[${V6_BROADCAST_IP}]`].includes(rawServerHost)) {
    return rawServerHost;
  }

  const interfaces = fetchInterfaces(rawServerHost === V4_BROADCAST_IP ? 4 : 6);
  const externalIps = [];
  for (const iface of interfaces) {
    if (iface.internal) {
      return iface.address;
    }
    externalIps.push(iface.address);
  }
  return externalIps.length ? externalIps[0] : rawServerHost;
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {() => Promise<any>} next
 * @param {import('appium/driver').BaseDriver} driver
 * @param {string} name
 * @param {number} port
 * @returns {Promise<import('../plugin').ProxyInfo>}
 */
export async function proxyDevtoolsTarget (next, driver, name, port) {
  const {adb, server} = requireDriverProperties(this.driver);

  const alias = toSocketNameAlias(name);
  if (alias in this.proxiedSessions) {
    throw new Error(`The target '${name}' is already being proxied`);
  }

  /** @type {(from: string, key: string) => WebSocket.Server} */
  const prepareWebSocketForwarder = (forwardToUrlPattern, entityIdPlaceholder) => {
    const wss = new WebSocket.Server({
      noServer: true,
    });
    wss.on('connection', (
      /** @type {WebSocket} */ wsUpstream,
      /** @type {import('http').IncomingMessage} */ req
    ) => {
      this.logger.debug(`Got a new websocket connection at ${req.url}`);
      if (!req.url) {
        this.logger.debug('The url is empty. Will ignore');
        wsUpstream.close(WS_SERVER_POLICY_VIOLATION);
        return;
      }
      const pathname = req.url;
      const entityId = extractWsEntityId(pathname);
      const dstUrl = entityId && forwardToUrlPattern.includes(entityIdPlaceholder)
        ? forwardToUrlPattern.replace(entityIdPlaceholder, entityId)
        : forwardToUrlPattern;
      this.logger.debug(`Will forward upstream ${req.url} to downstream ${dstUrl}`);
      const wsDownstream = new WebSocket(dstUrl);
      wsDownstream.on('message', (msg, binary) => {
        if (wsUpstream.readyState === WebSocket.OPEN) {
          wsUpstream.send(msg, {binary});
        }
      });
      wsUpstream.on('message', (msg, binary) => {
        if (wsDownstream.readyState === WebSocket.OPEN) {
          wsDownstream.send(msg, {binary});
        }
      });
      wsDownstream.once('error', (e) => {
        this.logger.warn(`Got an error from the downstream socket ${dstUrl}: ${e.message}`);
        if (wsUpstream.readyState === WebSocket.OPEN) {
          wsUpstream.close(WS_SERVER_ERROR, e.message);
        }
      });
      wsUpstream.once('error', (e) => {
        this.logger.info(`Got an error from the upstream socket: ${e.message}`);
      });
      wsDownstream.once('close', (code, reason) => {
        this.logger.info(
          `The downstream socket ${dstUrl} has been closed: ${code}, ` +
          `${reason ?? '(no reason given)'}`
        );
        if (wsUpstream.readyState === WebSocket.OPEN) {
          wsUpstream.close(code, reason);
        }
      });
      wsUpstream.once('close', (code, reason) => {
        this.logger.info(
          `The upstream socket has been closed: ${code}, ` +
          `${reason ?? '(no reason given)'}`
        );
      });
    });
    return wss;
  };

  this.logger.debug(`Starting the proxy for the Devtools target '${name}'`);
  let localPort = port;
  if (localPort) {
    if (await checkPortStatus(localPort) !== 'closed') {
      throw new Error(
        `The selected port number #${localPort} to forward the Devtools socket '${name}' is busy. ` +
        `Try to provide another free port number instead.`
      );
    }
  } else {
    const [startPort, endPort] = DEVTOOLS_BIND_PORTS_RANGE;
    try {
      localPort = await findAPortNotInUse(startPort, endPort);
    } catch (e) {
      throw new Error(
        `Cannot find any free port in range ${startPort}..${endPort} ` +
        `to forward the Devtools socket '${name}'. Try to provide a custom port ` +
        `number instead.`
      );
    }
  }
  const remotePort = name.replace(/^@/, '');
  const removePortForward = async () => {
    try {
      await adb.removePortForward(localPort);
    } catch (e) {
      this.logger.debug(`Cannot remove the port forward. Original error: ${e.message}`);
    }
  };
  try {
    await adb.adbExec(['forward', `tcp:${localPort}`, `localabstract:${remotePort}`]);
  } catch (e) {
    throw new Error(
      `Could not create a port forward to fetch the details of '${name}' socket: ${e.message}`
    );
  }

  let details;
  try {
    details = await collectSingleDetails.bind(this)(name, localPort);
  } catch (e) {
    await removePortForward();
    throw new Error(`The target '${name}' cannot be proxied. Original error: ${e.message}`);
  }
  const browserDebuggerUrl = details.info[DEBUGGER_URL_KEY];
  if (!browserDebuggerUrl) {
    this.logger.debug(JSON.stringify(details.info));
    await removePortForward();
    throw new Error(
      `The target '${name}' cannot be proxied. ` +
      `The response to /json/version did not contain the required '${DEBUGGER_URL_KEY}' key`
    );
  }

  /** @type {[string|RegExp, string][]}  */
  const rewrites = [];

  const serverProtocol = 'secure' in server && server.secure ? 'wss:' : 'ws:';
  /** @type {import('node:net').AddressInfo} */
  // @ts-ignore This is always an IP address
  const {address: rawServerHost, port: serverPort} = server.address();
  const serverHost = toServerHost(rawServerHost);
  const serverPath = (this.driver?.serverPath ?? '/').replace(/\/$/, '');
  const forwardTo =
    `${serverProtocol}//${serverHost}:${serverPort}/${CDP_METHODS_ROOT}/${this.uuid}/${alias}`;
  /** @type {URL} */
  let wdUrl;
  try {
    wdUrl = new URL(browserDebuggerUrl);
  } catch (e) {
    await removePortForward();
    throw new Error(
      `The target '${name}' cannot be proxied. ` +
      `The '${DEBUGGER_URL_KEY}' key value '${browserDebuggerUrl}' in the /json/version response is not a valid URL`
    );
  }
  const forwardFrom = `${wdUrl.protocol}//${wdUrl.host}`;
  rewrites.push([forwardFrom, forwardTo]);

  rewrites.push([
    // replace params
    `ws=${wdUrl.host}`,
    `ws=${serverHost}:${serverPort}${serverPath}/${CDP_METHODS_ROOT}/${this.uuid}/${alias}`,
  ], [
    `"/devtools/`,
    `"/${CDP_METHODS_ROOT}/${this.uuid}/${alias}/devtools/`
  ]);

  const browserEntityId = extractWsEntityId(browserDebuggerUrl);
  const forwardToPathname = new URL(forwardTo).pathname;
  const browserIdPlaceholder = ':browserId';
  const browserDebuggerPathname = browserEntityId
    ? `${forwardToPathname}/devtools/browser/${browserIdPlaceholder}`
    : `${forwardToPathname}/devtools/browser`;
  const pageIdPlaceholder = ':pageId';
  const pageDebuggerPathname = `${forwardToPathname}/devtools/page/${pageIdPlaceholder}`;

  for (const [placeholder, fromPathname, toUrlPattern] of [[
    browserIdPlaceholder,
    browserDebuggerPathname,
    browserEntityId ? browserDebuggerUrl.replace(browserEntityId, browserIdPlaceholder) : browserDebuggerUrl,
  ], [
    pageIdPlaceholder,
    pageDebuggerPathname,
    browserEntityId
      ? browserDebuggerUrl.replace(`/browser/${browserEntityId}`, `/page/${pageIdPlaceholder}`)
      : browserDebuggerUrl.replace(/\/browser\/?/, `/page/${pageIdPlaceholder}`),
  ]]) {
    await server.addWebSocketHandler(fromPathname, prepareWebSocketForwarder(toUrlPattern, placeholder));
  }

  this.proxiedSessions[alias] = {
    name,
    alias,
    root: forwardTo.replace(/^ws/, 'http'),
    browserDebuggerPathname,
    pageDebuggerPathname,
    port: localPort,
    rewrites,
  };
  this.logger.info(
    `Successfully started the proxy for the Devtools target '${name}' at ${forwardTo}: ` +
    JSON.stringify(this.proxiedSessions[alias], null, 2)
  );
  return toProxyInfo(this.proxiedSessions[alias]);
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {() => Promise<any>} next
 * @param {import('appium/driver').BaseDriver} driver
 * @param {string} name
 */
export async function unproxyDevtoolsTarget (next, driver, name) {
  const {adb, server} = requireDriverProperties(this.driver);

  const alias = toSocketNameAlias(name);
  if (!(alias in this.proxiedSessions)) {
    throw new Error(`The target '${name}' is not being proxied`);
  }

  this.logger.debug(`Stopping the proxy for the Devtools target '${name}'`);
  const {
    browserDebuggerPathname,
    pageDebuggerPathname,
    port,
  } = this.proxiedSessions[alias];
  const steps = [
    () => server.removeWebSocketHandler(browserDebuggerPathname),
    () => server.removeWebSocketHandler(pageDebuggerPathname),
    () => adb.removePortForward(port),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      this.logger.warn(e.message);
    }
  }
  this.logger.info(
    `Successfully stopped the proxy for the Devtools target '${name}': ` +
    JSON.stringify(this.proxiedSessions[alias], null, 2)
  );
  delete this.proxiedSessions[alias];
}
