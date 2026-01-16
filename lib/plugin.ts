import _ from 'lodash';
import { BasePlugin } from 'appium/plugin';
import { util } from 'appium/support';
import B from 'bluebird';
import * as proxyMethods from './mixins/proxy';
import * as cmdMethods from './mixins/cmds';
import { CDP_METHODS_ROOT } from './constants';
import { registerPlugin, findPlugin } from './registry';
import logger from './logger';
import type { BaseDriver } from 'appium/driver';

type Driver = BaseDriver<any, any, any, any, any, any>;
import type { Express, Request, Response } from 'express';
import type { ProxyInfo, ProxiedSession } from './types';

export default class DevtoolsPlugin extends BasePlugin {

  driverRef: WeakRef<Driver> | null = null;

  proxiedSessions: Record<string, ProxiedSession> = {};

  uuid: string;

  /**
   * @param pluginName
   */
  constructor(pluginName: string) {
    super(pluginName);
    this.driverRef = null;
    this.proxiedSessions = {};
    this.uuid = util.uuidV4();
    registerPlugin(this);
  }

  static executeMethodMap = {
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
  } as const;

  static async updateServer(expressApp: Express): Promise<void> {
    const buildHanlder = (
      methodName: string,
    ) => async (
      req: Request,
      res: Response
    ) => {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const plugin = findPlugin(uuid);
      if (!plugin) {
        logger.debug(`Cannot find any plugin instance identified by ${req.params.uuid}. Is it still alive?`);
        res.status(404).send();
        return;
      }
      try {
        // eslint-disable-next-line import/namespace
        const result = await (cmdMethods as any)[methodName].bind(plugin)(req);
        res.status(200).json(result);
      } catch (e: any) {
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

  /** @returns */
  get driver(): Driver | null {
    return this.driverRef?.deref() ?? null;
  }

  /**
   * @param next
   * @param driver
   * @param cmdName
   * @param cmdArgs
   */
  async handle(next: () => Promise<any>, driver: Driver, cmdName: string, ...cmdArgs: any[]): Promise<any> {
    if (!this.driverRef && 'adb' in driver && driver.adb) {
      this.driverRef = new WeakRef(driver);
      this.log.info(`Successfully initialized with ${driver.constructor.name}`);
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
