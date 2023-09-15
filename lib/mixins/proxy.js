import _ from 'lodash';
import {util} from 'appium/support';
import {findAPortNotInUse, checkPortStatus} from 'portscanner';
import B from 'bluebird';
import {toSocketNameAlias} from '../utils';
import WebSocket from 'ws';
import {CDP_METHODS_ROOT} from '../constants';
import { cdpInfo, cdpList } from './atoms';

const DEVTOOLS_SOCKET_PATTERN = /@[\w.]+_devtools_remote.*/;
// TODO: Make it configurable
const DEVTOOLS_LOOKUP_PORTS_RANGE = [12900, 13000];
const DEVTOOLS_BIND_PORTS_RANGE = [15900, 16000];
const DEBUGGER_URL_KEY = 'webSocketDebuggerUrl';
const WS_SERVER_ERROR = 1011;

/**
 * This function gets a list of android system processes and returns ones
 * that look like webviews
 * See https://cs.chromium.org/chromium/src/chrome/browser/devtools/device/android_device_info_query.cc
 * for more details
 *
 * @this {import('../plugin').DevtoolsPlugin}
 *
 * @return {Promise<string[]>} - a list of matching webview socket names (including the leading '@')
 */
async function getCandidateSocketNames() {
  this.log.debug('Getting a list of candidate devtools sockets');
  const out = await this.adb.shell(['cat', '/proc/net/unix']);
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
 * @this {import('../plugin').DevtoolsPlugin}
 * @param {string[]} socketNames
 * @returns {Promise<Record<string, WebviewProps>>}
 */
async function collectMultipleDetails(socketNames) {
  if (_.isEmpty(socketNames)) {
    return {};
  }

  const details = {};
  // Connect to each devtools socket and retrieve web view details
  this.log.debug(`Collecting CDP data of ${util.pluralize('candidate webview', socketNames.length, true)}`);
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
      await this.adb.adbExec(['forward', `tcp:${localPort}`, `localabstract:${remotePort}`]);
    } catch (e) {
      this.log.debug(
        `Could not create a port forward to fetch the details of '${socketName}' socket: ${e.message}`
      );
      continue;
    }

    try {
      details[socketName] = await collectSingleDetails.bind(this)(socketName, localPort);
    } catch (e) {
      this.log.debug(`Could not fetch the CDP details of '${socketName}' socket: ${e.message}`);
    } finally {
      try {
        await this.adb.removePortForward(localPort);
      } catch (e) {
        this.log.debug(e.message);
      }
    }
  }
  this.log.info(`Collected CDP details of ${util.pluralize('webview', _.size(details), true)}`);
  return details;
}

/**
 * @typedef {Object} DevtoolsTarget
 * @property {Record<string, any>} info
 * @property {Record<string, any>[]} pages
 * @property {string} name
 * @property {boolean} isProxied
 */

/**
 * @typedef {Object} DevtoolsTargetsInfo
 * @property {DevtoolsTarget[]} targets
 */

/**
 * @this {import('../plugin').DevtoolsPlugin}
 * @return {Promise<DevtoolsTargetsInfo>}
 */
export async function listDevtoolsTargets () {
  if (!this.adb) {
    return {targets: []};
  }

  const socketNames = await getCandidateSocketNames.bind(this)();
  const webviewsMapping = await collectMultipleDetails.bind(this)(socketNames);
  const targets = _.toPairs(webviewsMapping)
    .map(([name, {pages, info}]) => ({
      name,
      pages,
      info,
      isProxied: name in this.proxiedSessions
    }));
  return {targets};
}

function prepareWebSocketForwarder (from, key) {
  const wss = new WebSocket.Server({
    noServer: true,
  });
  wss.on('connection', (ws, req) => {
    const dstUrl = from.replace(new RegExp(`:${key}`, req.params[key]));
    const wsClient = new WebSocket(dstUrl);
    wsClient.on('message', (msg, binary) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg, {binary});
      }
    });
    ws.on('message', (msg, binary) => {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(msg, {binary});
      }
    });
    wsClient.once('error', (e) => {
      ws.close(WS_SERVER_ERROR, e.message);
    });
    ws.once('error', (e) => {
      wsClient.close(WS_SERVER_ERROR, e.message);
    });
    wsClient.once('close', (code, reason) => {
      ws.close(code, reason);
    });
    ws.once('close', (code, reason) => {
      wsClient.close(code, reason);
    });
  });
  return wss;
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function proxyDevtoolsTarget (name, port) {
  if (name in this.proxiedSessions) {
    throw new Error(`The target '${name}' is already being proxied`);
  }

  const [startPort, endPort] = DEVTOOLS_BIND_PORTS_RANGE;
  let localPort = port;
  if (localPort) {
    if (await checkPortStatus(localPort) !== 'closed') {
      throw new Error(
        `The selected port number #${localPort} to forward the Devtools socket '${name}' is busy. ` +
        `Try to provide another free port number instead.`
      );
    }
  } else {
    try {
      localPort = await findAPortNotInUse(startPort, endPort);
    } catch (e) {
      throw new Error(
        `Cannot find any free port in range ${startPort}..${endPort} ` +
        `to forward the Devtools socket '${name}'. Try to provide a custom port `
        `number instead.`
      );
    }
  }
  const remotePort = name.replace(/^@/, '');
  const removePortForward = async () => {
    try {
      await this.adb.removePortForward(localPort);
    } catch (e) {
      this.log.debug(`Cannot remove the port forward. Original error: ${e.message}`);
    }
  };
  try {
    await this.adb.adbExec(['forward', `tcp:${localPort}`, `localabstract:${remotePort}`]);
  } catch (e) {
    throw new Error(
      `Could not create a port forward to fetch the details of '${name}' socket: ${e.message}`
    );
  }

  let details;
  try {
    details = await collectSingleDetails.bind(this)([name]);
  } catch (e) {
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

  /** @type {[string|RegExp, string][]}  */
  const rewrites = [];

  const alias = toSocketNameAlias(name);
  const server = this.serverInfo.server;
  const serverProtocol = server.secure ? 'wss' : 'ws';
  const serverHost = this.serverInfo.host;
  const serverPort = this.serverInfo.port;
  const serverPath = this.serverInfo.path.replace(/\/$/, '');
  const forwardTo =
    `${serverProtocol}://${serverHost}:${serverPort}${serverPath}/session/${this.sessionId}/${CDP_METHODS_ROOT}/${alias}`;
  const forwardFrom = `${wdUrl.protocol}://${wdUrl.host}`;
  const wdUrl = new URL(browserDebuggerUrl);
  rewrites.push([forwardFrom, forwardTo]);

  rewrites.push([
    `${wdUrl.protocol}=${wdUrl.host}`,
    `${serverProtocol}=${serverHost}:${serverPort}${serverPath}/session/${this.sessionId}/${CDP_METHODS_ROOT}/${alias}`,
  ], [
    `"/devtools/`,
    `"${serverPath}/session/${this.sessionId}/${CDP_METHODS_ROOT}/${alias}/devtools/`
  ]);

  const browserIdKey = 'browserId';
  const browserDebuggerUrlPattern = `${new URL(forwardTo).pathname}/devtools/browser/:${browserIdKey}`;
  await server.addWebSocketHandler(
    browserDebuggerUrlPattern,
    prepareWebSocketForwarder(
      browserIdKey,
      browserDebuggerUrl.replace(
        _.last(browserDebuggerUrl.split('/'))
        , `:${browserIdKey}`
      ))
  );

  const pageIdKey = 'pageId';
  const pageDebuggerUrlPattern = `${new URL(forwardTo).pathname}/devtools/page/:${pageIdKey}`;
  await server.addWebSocketHandler(
    pageDebuggerUrlPattern,
    prepareWebSocketForwarder(
      pageIdKey,
      browserDebuggerUrl.replace('/browser/', '/page/').replace(
        _.last(pageDebuggerUrlPattern.split('/'))
        , `:${pageIdKey}`
      ))
  );

  this.proxiedSessions[alias] = {
    name,
    browserDebuggerPathname: browserDebuggerUrlPattern,
    pageDebuggerPathname: pageDebuggerUrlPattern,
    port: localPort,
    rewrites,
  };
}

/**
 * @this {import('../plugin').DevtoolsPlugin}
 */
export async function unproxyDevtoolsTarget (name) {
  const alias = toSocketNameAlias(name);
  if (!(alias in this.proxiedSessions)) {
    throw new Error(`The target '${name}' is not being proxied`);
  }

  const {
    browserDebuggerPathname,
    pageDebuggerPathname,
    port,
  } = this.proxiedSessions[alias];
  const server = this.serverInfo.server;
  const steps = [
    () => server.removeWebSocketHandler(browserDebuggerPathname),
    () => server.removeWebSocketHandler(pageDebuggerPathname),
    () => this.adb.removePortForward(port),
  ];
  for (const step in steps) {
    try {
      await step();
    } catch (e) {
      this.log.warn(e.message);
    }
  }
  delete this.proxiedSessions[alias];
}
