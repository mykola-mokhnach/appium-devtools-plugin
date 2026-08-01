import assert from 'node:assert/strict';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {describe, it, beforeEach} from 'node:test';

import sinon from 'sinon';

import {CDP_METHODS_ROOT} from '../../lib/constants.js';
import {DevtoolsPlugin} from '../../lib/plugin.js';
import type {ProxiedSession} from '../../lib/types.js';

function makeExpressApp() {
  const routes = new Map<string, (req: any, res: any) => any>();
  const app = {
    get: (routePath: string, handler: any) => routes.set(`GET ${routePath}`, handler),
    put: (routePath: string, handler: any) => routes.set(`PUT ${routePath}`, handler),
  };
  return {app: app as any, routes};
}

function makeExpressRes() {
  return {
    status: sinon.stub().returnsThis(),
    send: sinon.stub().returnsThis(),
    json: sinon.stub().returnsThis(),
  };
}

describe('DevtoolsPlugin', function () {
  let plugin: DevtoolsPlugin;
  const driverWithAdb = {
    adb: {},
  };
  const driverWoAdb = {};

  beforeEach(function () {
    plugin = new DevtoolsPlugin('devtools');
  });

  it('should init properties after session creation', async function () {
    assert.strictEqual(plugin.driver === null || plugin.driver === undefined, true);
    await plugin.handle(async () => {}, driverWithAdb as any, 'createSession');
    assert.strictEqual(plugin.driver === null || plugin.driver === undefined, false);
  });
  it('should reset properties after session deletion', async function () {
    await plugin.handle(async () => {}, driverWithAdb as any, 'createSession');
    await plugin.handle(async () => {}, driverWithAdb as any, 'deleteSession');
    assert.strictEqual(plugin.driver === null || plugin.driver === undefined, true);
  });
  it('should init properties after session creation if the driver has no adb', async function () {
    assert.strictEqual(plugin.driver === null || plugin.driver === undefined, true);
    await plugin.handle(async () => {}, driverWoAdb as any, 'createSession');
    assert.strictEqual(plugin.driver === null || plugin.driver === undefined, true);
  });
  it('should unproxy all active sessions on session deletion', async function () {
    await plugin.handle(async () => {}, driverWithAdb as any, 'createSession');
    const unproxyStub = sinon.stub(plugin, 'unproxyDevtoolsTarget').resolves();
    (plugin.proxiedSessions as Record<string, ProxiedSession>).alias1 = {name: '@one'} as ProxiedSession;
    (plugin.proxiedSessions as Record<string, ProxiedSession>).alias2 = {name: '@two'} as ProxiedSession;

    await plugin.handle(async () => {}, driverWithAdb as any, 'deleteSession');

    assert.strictEqual(unproxyStub.callCount, 2);
    assert.deepStrictEqual(
      unproxyStub
        .getCalls()
        .map((call: sinon.SinonSpyCall) => call.args[2])
        .sort(),
      ['@one', '@two'],
    );
  });

  it('should dispatch execute commands to the mapped instance method', async function () {
    const listStub = sinon.stub(plugin, 'listDevtoolsTargets').resolves({targets: []});
    const next = async () => {
      throw new Error('should not be called');
    };

    const result = await plugin.handle(next, driverWithAdb as any, 'execute', 'devtools: listTargets', []);

    assert.deepStrictEqual(result, {targets: []});
    assert.strictEqual(listStub.callCount, 1);
  });

  describe('updateServer', function () {
    it('should respond with 404 when no plugin matches the requested uuid', async function () {
      const {app, routes} = makeExpressApp();
      await DevtoolsPlugin.updateServer(app);
      const handler = routes.get(`GET /${CDP_METHODS_ROOT}/:uuid/:alias/json/list`)!;
      const res = makeExpressRes();

      await handler({params: {uuid: 'no-such-plugin', alias: 'x'}}, res);

      assert.strictEqual(res.status.firstCall.args[0], 404);
      assert.strictEqual(res.send.callCount, 1);
    });

    it('should respond with 404 when the underlying CDP command fails', async function () {
      const {app, routes} = makeExpressApp();
      await DevtoolsPlugin.updateServer(app);
      const handler = routes.get(`GET /${CDP_METHODS_ROOT}/:uuid/:alias/json/list`)!;
      const res = makeExpressRes();

      await handler({params: {uuid: plugin.uuid, alias: 'not-proxied'}}, res);

      assert.strictEqual(res.status.firstCall.args[0], 404);
      assert.strictEqual(res.send.callCount, 1);
    });

    it('should respond with 200 and the CDP payload on success', async function () {
      const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([{id: 'tab-1'}]));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      try {
        const port = (server.address() as AddressInfo).port;
        const alias = 'proxied-alias';
        (plugin.proxiedSessions as Record<string, ProxiedSession>)[alias] = {
          name: '@x',
          alias,
          root: '',
          browserDebuggerPathname: '',
          pageDebuggerPathname: '',
          port,
          rewrites: [],
        };
        const {app, routes} = makeExpressApp();
        await DevtoolsPlugin.updateServer(app);
        const handler = routes.get(`GET /${CDP_METHODS_ROOT}/:uuid/:alias/json/list`)!;
        const res = makeExpressRes();

        await handler({params: {uuid: plugin.uuid, alias}}, res);

        assert.strictEqual(res.status.firstCall.args[0], 200);
        assert.deepStrictEqual(res.json.firstCall.args[0], [{id: 'tab-1'}]);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
