import _ from 'lodash';
import BasePlugin from 'appium/plugin';
import B from 'bluebird';

/**
 * @typedef {Object} ProxiedSession
 * @property {string} name
 * @property {string} browserDebuggerPathname
 * @property {string} pageDebuggerPathname
 * @property {number} port
 * @property {[string|RegExp, string][]} rewrites
 */

/**
 * @typedef {Object} ServerInfo
 * @property {any} server
 * @property {string} host
 * @property {number} port
 * @property {string} path
 */

export default class DevtoolsPlugin extends BasePlugin {

  /** @type {boolean} */
  didCreateSession;

  /** @type {any?} */
  adb;

  /** @type {boolean} */
  didQueryAdb;

  /** @type {ServerInfo?} */
  serverInfo;

  /** @type {string?} */
  sessionId;

  /** @type {Record<string, ProxiedSession>} */
  proxiedSessions;

  constructor(pluginName) {
    super(pluginName);
    this.didCreateSession = false;
    this.didQueryAdb = false;
    this.adb = null;
    this.serverInfo = null;
    this.sessionId = null;
    this.proxiedSessions = {};
  }

  static executeMethodMap = /** @type {const} */ ({
    'devtools: listTargets': {
      command: 'listDevtoolsTargets',
    },
    'devtools: proxyTarget': {
      command: 'proxyDevtoolsTarget',
      params: {
        required: ['name'],
        optional: ['port'],
      },
    },
    'devtools: unproxyTarget': {
      command: 'unproxyDevtoolsTarget',
      params: {
        required: ['name'],
      },
    }
  });

  // https://chromedevtools.github.io/devtools-protocol/
  static newMethodMap = /** @type {const} */ ({
    'session/:sessionId/appium/cdp/:alias/json/version': {
      GET: {
        command: 'cmdVersion',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json': {
      GET: {
        command: 'cmdListAlias',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json/list': {
      GET: {
        command: 'cmdList',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json/protocol': {
      GET: {
        command: 'cmdProtocol',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json/new': {
      PUT: {
        command: 'cmdOpenTab',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json/activate/:targetId': {
      GET: {
        command: 'cmdActivateTab',
        neverProxy: true,
      },
    },
    '/session/:sessionId/appium/cdp/:alias/json/close/:targetId': {
      GET: {
        command: 'cmdCloseTab',
        neverProxy: true,
      },
    },
    // /devtools/page/{targetId} and /devtools/browser are created dynamically
    '/session/:sessionId/appium/cdp/:alias/devtools/inspector.html': {
      GET: {
        command: 'cmdInspector',
        neverProxy: true,
      },
    },
  });

  async handle(next, driver, cmdName) {
    switch (cmdName) {
      case 'createSession':
        this.didCreateSession = true;
        return await next();
      case 'deleteSession':
        if (this.proxiedSessions) {
          const names = _.values(this.proxiedSessions).map(({name}) => name);
          await B.all(
            names.map((name) => this.unproxyDevtoolsTarget(name))
          );
        }
        if (this.adb) {
          this.adb = null;
          this.sessionId = null;
          this.serverInfo = null;
          this.didQueryAdb = false;
        }
        return await next();
    }

    if (this.didCreateSession && !this.adb && !this.didQueryAdb) {
      this.didQueryAdb = true;
      if (driver.adb) {
        this.adb = driver.adb;
        this.serverInfo = {
          server: driver.server,
          host: driver.serverHost,
          port: driver.serverPort,
          path: driver.serverPath,
        };
        this.sessionId = driver.sessionId;
      } else {
        this.log.info(
          `The ${driver.constructor.name} does not own an ADB instance. `
          `This plugin won't have any effect with it`
        );
      }
    }

    return await next();
  }
}

export {DevtoolsPlugin};
