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

  /** @type {Record<string, ProxiedSession>} */
  proxiedSessions;

  constructor(pluginName) {
    super(pluginName);
    this.driverRef = null;
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

  /** @returns {import('appium/driver').BaseDriver?} */
  get driver () {
    return this.driverRef?.deref() ?? null;
  }

  /** @returns {any?} */
  get adb () {
    return this.driver?.adb ?? null;
  }

  /** @returns {ServerInfo?} */
  get serverInfo () {
    return this.driver ? {
      server: this.driver.server,
      host: this.driver.serverHost,
      port: this.driver.serverPort,
      path: this.driver.serverPath,
    } : null;
  }

  /** @returns {string?} */
  get sessionId () {
    return this.driver?.sessionId ?? null;
  }

  /**
   *
   * @param {() => Promise<any>} next
   * @param {import('appium/driver').BaseDriver} driver
   * @param {string} cmdName
   */
  async handle(next, driver, cmdName) {
    switch (cmdName) {
      case 'createSession':
        // eslint-disable-next-line no-undef
        this.driverRef = new WeakRef(driver);
        break;
      case 'deleteSession':
        if (!_.isEmpty(this.proxiedSessions)) {
          const names = _.values(this.proxiedSessions).map(({name}) => name);
          await B.all(
            names.map((name) => this.unproxyDevtoolsTarget(name))
          );
        }
        if (this.driverRef) {
          this.driverRef = null;
        }
        break;
    }

    return await next();
  }
}

export {DevtoolsPlugin};
