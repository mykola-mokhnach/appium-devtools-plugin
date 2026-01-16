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
import type { DevtoolsPlugin } from '../plugin';
import type { BaseDriver } from 'appium/driver';
import type { RequiredDriverProperties, WebviewProps, DevtoolsTargetsInfo, ProxyInfo } from '../types';
import type { IncomingMessage } from 'http';

type Driver = BaseDriver<any, any, any, any, any, any>;

const DEVTOOLS_SOCKET_PATTERN = /@[\w.]+_devtools_remote.*/;
// TODO: Make it configurable
const DEVTOOLS_LOOKUP_PORTS_RANGE: [number, number] = [12900, 13000];
const DEVTOOLS_BIND_PORTS_RANGE: [number, number] = [15900, 16000];
const DEBUGGER_URL_KEY = 'webSocketDebuggerUrl';
const WS_SERVER_ERROR = 1011;
const WS_SERVER_POLICY_VIOLATION = 1008;
const WS_ENTITY_ID_PATTERN = /\/devtools\/(browser|page)\/([a-fA-F0-9-]+)/;

function requireDriverProperties(driver: Driver | null): RequiredDriverProperties {
  const result: any = {};
  for (const propName of ['adb', 'server']) {
    if (!driver?.[propName as keyof Driver]) {
      throw new Error(
        `The driver '${driver?.constructor.name}' does not have the required '${propName}' property. ` +
        'Is it a valid Android driver?'
      );
    }
    result[propName] = driver[propName as keyof Driver];
  }
  return result as RequiredDriverProperties;
}

/**
 * This function gets a list of android system processes and returns ones
 * that look like webviews
 * See https://cs.chromium.org/chromium/src/chrome/browser/devtools/device/android_device_info_query.cc
 * for more details
 *
 * @this {DevtoolsPlugin}
 * @return - a list of matching webview socket names (including the leading '@')
 */
async function getCandidateSocketNames(this: DevtoolsPlugin): Promise<string[]> {
  const {adb} = requireDriverProperties(this.driver);
  this.log.debug('Getting a list of candidate devtools sockets');
  const out = await adb.shell(['cat', '/proc/net/unix']);
  const names: string[] = [];
  const allMatches: string[] = [];
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
    this.log.debug('Found no active devtools sockets');
    if (!_.isEmpty(allMatches)) {
      this.log.debug(`Other sockets are: ${JSON.stringify(allMatches, null, 2)}`);
    }
  } else {
    this.log.debug(
      `Parsed ${names.length} active devtools ${util.pluralize('socket', names.length, false)}: ` +
        JSON.stringify(names)
    );
  }
  // sometimes the webview process shows up multiple times per app
  return _.uniq(names);
}

/**
 * This is a wrapper for Chrome Debugger Protocol data collection.
 * No error is thrown if CDP request fails - in such case no data will be
 * recorded into the corresponding `webviewsMapping` item.
 *
 * @this {DevtoolsPlugin}
 * @param socketName
 * @param localPort
 * @returns
 */
async function collectSingleDetails(this: DevtoolsPlugin, socketName: string, localPort: number): Promise<WebviewProps> {
  this.log.debug(`Collecting CDP data of '${socketName}'`);
  const [info, pages] = await B.all([cdpInfo(localPort), cdpList(localPort)]);
  this.log.info(`Collected CDP details of '${socketName}'`);
  return {info, pages};
}

/**
 * This is a wrapper for Chrome Debugger Protocol data collection.
 * No error is thrown if CDP request fails - in such case no data will be
 * recorded into the corresponding `webviewsMapping` item.
 *
 * @this {DevtoolsPlugin}
 * @param socketNames
 * @returns
 */
async function collectMultipleDetails(this: DevtoolsPlugin, socketNames: string[]): Promise<Record<string, WebviewProps>> {
  const {adb} = requireDriverProperties(this.driver);
  if (_.isEmpty(socketNames)) {
    return {};
  }

  const details: Record<string, WebviewProps> = {};
  // Connect to each devtools socket and retrieve web view details
  this.log.debug(`Collecting CDP data of ${util.pluralize('candidate webview', socketNames.length, true)}`);
  const [startPort, endPort] = DEVTOOLS_LOOKUP_PORTS_RANGE;
  let localPort: number;
  try {
    localPort = await findAPortNotInUse(startPort, endPort);
  } catch {
    throw new Error(
      `Cannot find any free port to forward candidate Devtools sockets ` +
      `in range ${startPort}..${endPort}`
    );
  }
  for (const socketName of socketNames) {
    const remotePort = socketName.replace(/^@/, '');
    try {
      await adb.forwardAbstractPort(localPort, remotePort);
    } catch (e: any) {
      this.log.debug(
        `Could not create a port forward to fetch the details of '${socketName}' socket: ${e.message}`
      );
      continue;
    }

    try {
      details[socketName] = await collectSingleDetails.bind(this)(socketName, localPort);
    } catch (e: any) {
      this.log.debug(`Could not fetch the CDP details of '${socketName}' socket: ${e.message}`);
    } finally {
      try {
        await adb.removePortForward(localPort);
      } catch (e: any) {
        this.log.debug(e.message);
      }
    }
  }
  this.log.info(`Collected CDP details of ${util.pluralize('webview', _.size(details), true)}`);
  return details;
}

/**
 * @this {DevtoolsPlugin}
 * @param alias
 * @returns
 */
function toProxyInfo(this: DevtoolsPlugin, alias: string): ProxyInfo {
  return {
    uuid: this.uuid,
    ..._.pick(this.proxiedSessions[alias], 'alias', 'name', 'root'),
  };
}

/**
 * Lists all available Chrome DevTools Protocol targets on the connected Android device.
 * This includes both proxied and non-proxied targets with their associated information.
 *
 * @this {DevtoolsPlugin}
 * @returns Information about all available DevTools targets, including their proxy status
 */
export async function listDevtoolsTargets(this: DevtoolsPlugin): Promise<DevtoolsTargetsInfo> {
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
        proxyInfo: isProxied ? toProxyInfo.bind(this)(alias) : null,
      };
    });
  return {targets};
}

function extractWsEntityId(pathname: string): string | null {
  const match = WS_ENTITY_ID_PATTERN.exec(pathname);
  return match ? match[2] : null;
}

function toServerHost(rawServerHost: string): string {
  if (![V4_BROADCAST_IP, V6_BROADCAST_IP, `[${V6_BROADCAST_IP}]`].includes(rawServerHost)) {
    return rawServerHost;
  }

  const interfaces = fetchInterfaces(rawServerHost === V4_BROADCAST_IP ? 4 : 6);
  const externalIps: string[] = [];
  for (const iface of interfaces) {
    if (iface.internal) {
      return iface.address;
    }
    externalIps.push(iface.address);
  }
  return externalIps.length ? externalIps[0] : rawServerHost;
}

function prepareWebSocketForwarder(this: DevtoolsPlugin, forwardToUrlPattern: string, entityIdPlaceholder: string): WebSocket.Server {
  const wss = new WebSocket.Server({
    noServer: true,
  });
  wss.on('connection', (
    wsUpstream: WebSocket,
    req: IncomingMessage
  ) => {
    this.log.debug(`Got a new websocket connection at ${req.url}`);
    if (!req.url) {
      this.log.debug('The url is empty. Will ignore');
      wsUpstream.close(WS_SERVER_POLICY_VIOLATION);
      return;
    }
    const pathname = req.url;
    const entityId = extractWsEntityId(pathname);
    const dstUrl = entityId && forwardToUrlPattern.includes(entityIdPlaceholder)
      ? forwardToUrlPattern.replace(entityIdPlaceholder, entityId)
      : forwardToUrlPattern;
    this.log.debug(`Will forward upstream ${req.url} to downstream ${dstUrl}`);
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
    wsDownstream.once('error', (e: Error) => {
      this.log.warn(`Got an error from the downstream ${dstUrl}: ${e.message}`);
    });
    wsUpstream.once('error', (e: Error) => {
      this.log.info(`Got an error from the upstream ${req.url}: ${e.message}`);
    });
    wsDownstream.once('close', (code: number | undefined, reason: Buffer) => {
      this.log.info(
        `The downstream ${dstUrl} has been closed: ${code}, ` +
        `${reason || '(no reason given)'}`
      );
      if (wsUpstream.readyState === WebSocket.OPEN) {
        wsUpstream.close(code ?? WS_SERVER_ERROR, reason);
      }
    });
    wsUpstream.once('close', (code: number | undefined, reason: Buffer) => {
      this.log.info(
        `The upstream ${req.url} has been closed: ${code}, ` +
        `${reason || '(no reason given)'}`
      );
      if (wsDownstream.readyState === WebSocket.OPEN) {
        wsDownstream.close();
      }
    });
  });
  return wss;
}

/**
 * Proxies a Chrome DevTools Protocol target, making it accessible through the Appium server.
 * This sets up port forwarding, WebSocket handlers, and URL rewriting to enable remote access
 * to the DevTools interface.
 *
 * @this {DevtoolsPlugin}
 * @param next - The next handler in the plugin chain
 * @param driver - The Appium driver instance
 * @param name - The socket name of the target to proxy (e.g., '@webview_devtools_remote_12345')
 * @param port - Optional local port number to use for forwarding. If not provided, an available port will be selected automatically
 * @returns Proxy information including UUID, alias, name, and root URL
 * @throws {Error} If the target is already being proxied, port is busy, or target cannot be proxied
 */
export async function proxyDevtoolsTarget(this: DevtoolsPlugin, next: () => Promise<any>, driver: Driver, name: string, port?: number): Promise<ProxyInfo> {
  const {adb, server} = requireDriverProperties(this.driver);

  const alias = toSocketNameAlias(name);
  if (alias in this.proxiedSessions) {
    throw new Error(`The target '${name}' is already being proxied`);
  }

  this.log.debug(`Starting the proxy for the Devtools target '${name}'`);
  let localPort: number;
  if (port) {
    localPort = port;
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
    } catch {
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
    } catch (e: any) {
      this.log.debug(`Cannot remove the port forward. Original error: ${e.message}`);
    }
  };
  try {
    await adb.forwardAbstractPort(localPort, remotePort);
  } catch (e: any) {
    throw new Error(
      `Could not create a port forward to fetch the details of '${name}' socket: ${e.message}`
    );
  }

  let details: WebviewProps;
  try {
    details = await collectSingleDetails.bind(this)(name, localPort);
  } catch (e: any) {
    await removePortForward();
    throw new Error(`The target '${name}' cannot be proxied. Original error: ${e.message}`);
  }
  const browserDebuggerUrl = details.info[DEBUGGER_URL_KEY];
  if (!browserDebuggerUrl) {
    this.log.debug(JSON.stringify(details.info));
    await removePortForward();
    throw new Error(
      `The target '${name}' cannot be proxied. ` +
      `The response to /json/version did not contain the required '${DEBUGGER_URL_KEY}' key`
    );
  }

  const rewrites: [string | RegExp, string][] = [];

  const serverProtocol = 'secure' in server && server.secure ? 'wss:' : 'ws:';
  const addressInfo = server.address();
  if (!addressInfo || typeof addressInfo === 'string') {
    await removePortForward();
    throw new Error('Server address is not available');
  }
  const {address: rawServerHost, port: serverPort} = addressInfo;
  const serverHost = toServerHost(rawServerHost);
  const forwardTo =
    `${serverProtocol}//${serverHost}:${serverPort}/${CDP_METHODS_ROOT}/${this.uuid}/${alias}`;
  let wdUrl: URL;
  try {
    wdUrl = new URL(browserDebuggerUrl);
  } catch {
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
    `ws=${serverHost}:${serverPort}/${CDP_METHODS_ROOT}/${this.uuid}/${alias}`,
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
    await server.addWebSocketHandler(
      fromPathname, prepareWebSocketForwarder.bind(this)(toUrlPattern, placeholder)
    );
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
  this.log.info(
    `Successfully started the proxy for the Devtools target '${name}' at ${forwardTo}: ` +
    JSON.stringify(this.proxiedSessions[alias], null, 2)
  );
  return toProxyInfo.bind(this)(alias);
}

/**
 * Stops proxying a Chrome DevTools Protocol target, cleaning up port forwards and WebSocket handlers.
 *
 * @this {DevtoolsPlugin}
 * @param next - The next handler in the plugin chain
 * @param driver - The Appium driver instance
 * @param name - The socket name of the target to unproxy
 * @throws {Error} If the target is not currently being proxied
 */
export async function unproxyDevtoolsTarget(this: DevtoolsPlugin, next: () => Promise<any>, driver: Driver, name: string): Promise<void> {
  const {adb, server} = requireDriverProperties(this.driver);

  const alias = toSocketNameAlias(name);
  if (!(alias in this.proxiedSessions)) {
    throw new Error(`The target '${name}' is not being proxied`);
  }

  this.log.debug(`Stopping the proxy for the Devtools target '${name}'`);
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
    } catch (e: any) {
      this.log.warn(e.message);
    }
  }
  this.log.info(
    `Successfully stopped the proxy for the Devtools target '${name}': ` +
    JSON.stringify(this.proxiedSessions[alias], null, 2)
  );
  delete this.proxiedSessions[alias];
}
