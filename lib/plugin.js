import _ from 'lodash';
import { BasePlugin } from 'appium/plugin';
import { util } from 'appium/support';
import B from 'bluebird';
import * as proxyMethods from './mixins/proxy';
import * as cmdMethods from './mixins/cmds';
import { CDP_METHODS_ROOT } from './constants';
import { registerPlugin, findPlugin } from './registry';
import logger from './logger';

/**
 * @typedef {Object} ProxyInfo
 * @property {string} name
 * @property {string} uuid
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

export default class DevtoolsPlugin extends BasePlugin {

  /** @type {WeakRef<import('appium/driver').BaseDriver>?} */
  driverRef;

  /** @type {Record<string, ProxiedSession>} */
  proxiedSessions;

  /** @type {string} */
  uuid;

  /**
   * @param {string} pluginName
   */
  constructor(pluginName) {
    super(pluginName);
    this.driverRef = null;
    this.proxiedSessions = {};
    this.uuid = util.uuidV4();
    registerPlugin(this);
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

  /** @type {import('@appium/types').UpdateServerCallback} */
  // eslint-disable-next-line require-await
  static async updateServer(expressApp) {
    const buildHanlder = (
      /** @type {string} */methodName,
    ) => async (
      /** @type {import('express').Request} */ req,
      /** @type {import('express').Response} */ res
    ) => {
      const plugin = findPlugin(req.params.uuid);
      if (!plugin) {
        logger.debug(`Cannot find any plugin instance identified by ${req.params.uuid}. Is is still alive?`);
        res.status(404).send();
        return;
      }
      try {
        const result = await cmdMethods[methodName].bind(plugin)(req);
        res.status(200).json(result);
      } catch (e) {
        logger.warn(`Got an unexpected error while executing devtools method '${methodName}': ${e.message}`);
        logger.debug(e.stack);
        res.status(404).send();
      }
    };

    // https://chromedevtools.github.io/devtools-protocol/
    expressApp.get(`/${CDP_METHODS_ROOT}/:uuid/:alias/json/version`, buildHanlder('cmdVersion'));
    expressApp.get(`/${CDP_METHODS_ROOT}/:uuid/:alias/json`, buildHanlder('cmdList'));
    expressApp.get(`/${CDP_METHODS_ROOT}/:uuid/:alias/json/list`, buildHanlder('cmdList'));
    expressApp.get(`/${CDP_METHODS_ROOT}/:uuid/:alias/json/protocol`, buildHanlder('cmdProtocol'));
    expressApp.put(`/${CDP_METHODS_ROOT}/:uuid/:alias/json/new`, buildHanlder('cmdOpenTab'));
    expressApp.get(
      `/${CDP_METHODS_ROOT}/:uuid/:alias/json/activate/:targetId`, buildHanlder('cmdActivateTab')
    );
    expressApp.get(
      `/${CDP_METHODS_ROOT}/:uuid/:alias/json/close/:targetId`, buildHanlder('cmdCloseTab')
    );
    expressApp.get(
      `/${CDP_METHODS_ROOT}/:uuid/:alias/devtools/inspector.html`, buildHanlder('cmdInspector')
    );
  }

  /** @returns {import('appium/driver').BaseDriver?} */
  get driver () {
    return this.driverRef?.deref() ?? null;
  }

  /**
   * @param {() => Promise<any>} next
   * @param {import('appium/driver').BaseDriver} driver
   * @param {string} cmdName
   * @param {...any} cmdArgs
   */
  async handle(next, driver, cmdName, ...cmdArgs) {
    if (!this.driverRef && 'adb' in driver && driver.adb) {
      // eslint-disable-next-line no-undef
      this.driverRef = new WeakRef(driver);
      this.logger.info(`Successfully initialized with ${driver.constructor.name}`);
    }

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
        if (this.driverRef) {
          this.driverRef = null;
        }
        break;
    }

    return await next();
  }

  listDevtoolsTargets = proxyMethods.listDevtoolsTargets;
  proxyDevtoolsTarget = proxyMethods.proxyDevtoolsTarget;
  unproxyDevtoolsTarget = proxyMethods.unproxyDevtoolsTarget;
}

export {DevtoolsPlugin};
