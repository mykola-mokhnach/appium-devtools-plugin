import _ from 'lodash';
import { BasePlugin } from 'appium/plugin';
import B from 'bluebird';
import * as proxyMethods from './mixins/proxy';
import * as cmdMethods from './mixins/cmds';

/**
 * @typedef {Object} ProxyInfo
 * @property {string} name
 * @property {string} alias
 * @property {string} root
 */

/**
 * @typedef {Object} ProxiedSession
 * @property {string} name
 * @property {string} alias
 * @property {string} root
 * @property {string} browserDebuggerPathname
 * @property {string} pageDebuggerPathname
 * @property {number} port
 * @property {[string|RegExp, string][]} rewrites
 */

/**
 * @typedef {Object} ServerInfo
 * @property {import('@appium/types').AppiumServer} server
 * @property {string} path
 */

export default class DevtoolsPlugin extends BasePlugin {

  /** @type {Record<string, ProxiedSession>} */
  proxiedSessions;

  constructor(pluginName) {
    super(pluginName);
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
    '/session/:sessionId/appium/cdp/:alias/json/version': {
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

  /**
   * @param {() => Promise<any>} next
   * @param {import('appium/driver').BaseDriver} driver
   * @param {string} cmdName
   * @param {...any} cmdArgs
   */
  async handle(next, driver, cmdName, ...cmdArgs) {
    switch (cmdName) {
      case 'execute':
        return await this.executeMethod(next, driver, cmdArgs[0], cmdArgs[1]);
      case 'deleteSession':
        if (!_.isEmpty(this.proxiedSessions)) {
          const names = _.values(this.proxiedSessions).map(({name}) => name);
          await B.all(
            names.map((name) => this.unproxyDevtoolsTarget(next, driver, name))
          );
        }
        break;
    }

    return await next();
  }

  listDevtoolsTargets = proxyMethods.listDevtoolsTargets;
  proxyDevtoolsTarget = proxyMethods.proxyDevtoolsTarget;
  unproxyDevtoolsTarget = proxyMethods.unproxyDevtoolsTarget;

  cmdVersion = cmdMethods.cmdVersion;
  cmdListAlias = cmdMethods.cmdListAlias;
  cmdList = cmdMethods.cmdList;
  cmdProtocol = cmdMethods.cmdProtocol;
  cmdOpenTab = cmdMethods.cmdOpenTab;
  cmdActivateTab = cmdMethods.cmdActivateTab;
  cmdCloseTab = cmdMethods.cmdCloseTab;
  cmdInspector = cmdMethods.cmdInspector;
}

export {DevtoolsPlugin};
