import assert from 'node:assert/strict';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import * as proxy from '../../../lib/mixins/proxy.js';
import {toSocketNameAlias} from '../../../lib/utils.js';

function makeServer(overrides: Record<string, any> = {}) {
  return {
    secure: false,
    address: () => ({address: '127.0.0.1', port: 4723}),
    addWebSocketHandler: sinon.stub().resolves(),
    removeWebSocketHandler: sinon.stub().resolves(true),
    ...overrides,
  };
}

function makePlugin(driver: Record<string, any> = {}): any {
  return {
    uuid: 'plugin-uuid',
    log: {debug() {}, info() {}, warn() {}},
    proxiedSessions: {},
    driver,
  };
}

const NOOP_NEXT = async () => {};

describe('mixins/proxy', function () {
  describe('proxyDevtoolsTarget / unproxyDevtoolsTarget', function () {
    it('should fail if the driver does not expose adb/server', async function () {
      const plugin = makePlugin({});
      await assert.rejects(
        proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@x'),
        /does not have the required 'adb' property/,
      );
    });

    it('should fail if the target is already being proxied', async function () {
      const plugin = makePlugin({adb: {}, server: makeServer()});
      const name = '@webview_devtools_remote_1234';
      plugin.proxiedSessions[toSocketNameAlias(name)] = {};

      await assert.rejects(proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, name), /already being proxied/);
    });

    it('should fail if the requested local port is busy', async function () {
      const blocker = http.createServer();
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
      try {
        const busyPort = (blocker.address() as AddressInfo).port;
        const plugin = makePlugin({adb: {}, server: makeServer()});

        await assert.rejects(proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@x', busyPort), /is busy/);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });

    it('should wrap adb port-forward failures', async function () {
      const adb = {forwardAbstractPort: sinon.stub().rejects(new Error('adb boom'))};
      const plugin = makePlugin({adb, server: makeServer()});

      await assert.rejects(
        proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@x'),
        /Could not create a port forward.*adb boom/,
      );
    });

    it('should clean up the port forward if the CDP endpoint is unreachable', async function () {
      const removePortForward = sinon.stub().resolves();
      const adb = {forwardAbstractPort: sinon.stub().resolves(), removePortForward};
      const plugin = makePlugin({adb, server: makeServer()});

      await assert.rejects(proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@x'), /cannot be proxied/);
      assert.strictEqual(removePortForward.callCount, 1);
    });

    it('should clean up the port forward if the CDP endpoint has no websocket debugger url', async function () {
      const cdpServer = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/json/version') {
          res.end(JSON.stringify({}));
        } else if (req.url === '/json/list') {
          res.end(JSON.stringify([]));
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
      const removePortForward = sinon
        .stub()
        .callsFake(() => new Promise<void>((resolve) => cdpServer.close(() => resolve())));
      const adb = {
        forwardAbstractPort: sinon
          .stub()
          .callsFake(
            (localPort: number) =>
              new Promise<void>((resolve) => cdpServer.listen(localPort, '127.0.0.1', () => resolve())),
          ),
        removePortForward,
      };
      const plugin = makePlugin({adb, server: makeServer()});

      await assert.rejects(
        proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@x'),
        /did not contain the required/,
      );
      assert.strictEqual(removePortForward.callCount, 1);
    });

    it('should proxy a target end-to-end and clean it up on unproxy', async function () {
      const cdpServer = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/json/version') {
          res.end(JSON.stringify({webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc-123'}));
        } else if (req.url === '/json/list') {
          res.end(JSON.stringify([]));
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
      const adb = {
        forwardAbstractPort: sinon
          .stub()
          .callsFake(
            (localPort: number) =>
              new Promise<void>((resolve) => cdpServer.listen(localPort, '127.0.0.1', () => resolve())),
          ),
        removePortForward: sinon
          .stub()
          .callsFake(() => new Promise<void>((resolve) => cdpServer.close(() => resolve()))),
      };
      const server = makeServer();
      const plugin = makePlugin({adb, server});
      const name = '@webview_devtools_remote_1234';

      const info = await proxy.proxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, name);

      assert.strictEqual(info.uuid, plugin.uuid);
      assert.strictEqual(info.name, name);
      assert.strictEqual(info.alias, toSocketNameAlias(name));
      assert.match(info.root, /^http:\/\/127\.0\.0\.1:4723\/cdp\//);
      assert.strictEqual(server.addWebSocketHandler.callCount, 2);
      assert.ok(plugin.proxiedSessions[info.alias]);

      await proxy.unproxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, name);

      assert.strictEqual(server.removeWebSocketHandler.callCount, 2);
      assert.strictEqual(adb.removePortForward.callCount, 1);
      assert.strictEqual(plugin.proxiedSessions[info.alias], undefined);
    });

    it('should fail to unproxy a target that is not currently proxied', async function () {
      const plugin = makePlugin({adb: {}, server: makeServer()});

      await assert.rejects(
        proxy.unproxyDevtoolsTarget.call(plugin, NOOP_NEXT, {} as any, '@not-proxied'),
        /is not being proxied/,
      );
    });
  });

  describe('listDevtoolsTargets', function () {
    it('should return no targets when there are no candidate devtools sockets', async function () {
      const adb = {shell: sinon.stub().resolves('')};
      const plugin = makePlugin({adb, server: makeServer()});

      const result = await proxy.listDevtoolsTargets.call(plugin, NOOP_NEXT, {} as any);

      assert.deepStrictEqual(result, {targets: []});
    });

    it('should skip candidate sockets whose port forward fails', async function () {
      const shellOutput = [
        'Num RefCount Protocol Flags Type St Inode Path',
        '0: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_1234',
      ].join('\n');
      const adb = {
        shell: sinon.stub().resolves(shellOutput),
        forwardAbstractPort: sinon.stub().rejects(new Error('no device')),
      };
      const plugin = makePlugin({adb, server: makeServer()});

      const result = await proxy.listDevtoolsTargets.call(plugin, NOOP_NEXT, {} as any);

      assert.deepStrictEqual(result, {targets: []});
    });
  });
});
