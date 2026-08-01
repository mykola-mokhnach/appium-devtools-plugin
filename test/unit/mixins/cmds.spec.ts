import assert from 'node:assert/strict';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {after, before, describe, it} from 'node:test';

import {errors} from 'appium/driver.js';

import * as cmds from '../../../lib/mixins/cmds.js';
import type {DevtoolsPlugin} from '../../../lib/plugin.js';
import type {ProxiedSession} from '../../../lib/types.js';

describe('mixins/cmds', function () {
  // Echoes back the HTTP method and path so we can assert requests were
  // forwarded to the right local port, and that replaceDeep rewrites are applied.
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({method: req.method, url: req.url}));
  });
  let port: number;

  before(async function () {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  after(async function () {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const REWRITES: [string | RegExp, string][] = [['GET', 'REWRITTEN']];
  const ALIAS = 'my-alias';

  function pluginWithSession(rewrites: [string | RegExp, string][] = REWRITES): DevtoolsPlugin {
    const session: ProxiedSession = {
      name: '@webview_devtools_remote',
      alias: ALIAS,
      root: '',
      browserDebuggerPathname: '',
      pageDebuggerPathname: '',
      port,
      rewrites,
    };
    return {proxiedSessions: {[ALIAS]: session}} as unknown as DevtoolsPlugin;
  }

  it('should reject with UnknownCommandError for an alias that is not proxied', async function () {
    const plugin = {proxiedSessions: {}} as unknown as DevtoolsPlugin;
    await assert.rejects(cmds.cmdVersion.call(plugin, {params: {alias: 'unknown'}} as any), errors.UnknownCommandError);
  });

  const GET_CASES: [string, (this: DevtoolsPlugin, req: any) => Promise<any>][] = [
    ['cmdVersion', cmds.cmdVersion],
    ['cmdList', cmds.cmdList],
    ['cmdProtocol', cmds.cmdProtocol],
    ['cmdInspector', cmds.cmdInspector],
  ];

  for (const [name, fn] of GET_CASES) {
    it(`should proxy ${name} to the forwarded port and apply rewrites`, async function () {
      const result = await fn.call(pluginWithSession(), {params: {alias: ALIAS}} as any);
      assert.strictEqual(result.method, 'REWRITTEN');
    });
  }

  it('should forward the first query key as the tab url when opening a tab', async function () {
    const result = await cmds.cmdOpenTab.call(pluginWithSession(), {
      params: {alias: ALIAS},
      query: {'https://example.com': ''},
    } as any);
    assert.strictEqual(result.url, '/json/new?https%3A%2F%2Fexample.com');
  });

  it('should open a blank tab when no url query is given', async function () {
    const result = await cmds.cmdOpenTab.call(pluginWithSession(), {
      params: {alias: ALIAS},
      query: {},
    } as any);
    assert.strictEqual(result.url, '/json/new');
  });

  it('should unwrap an array-valued targetId param when activating a tab', async function () {
    const result = await cmds.cmdActivateTab.call(pluginWithSession(), {
      params: {alias: ALIAS, targetId: ['target-1', 'target-2']},
    } as any);
    assert.strictEqual(result.url, '/json/activate/target-1');
  });

  it('should use a plain string targetId when closing a tab', async function () {
    const result = await cmds.cmdCloseTab.call(pluginWithSession(), {
      params: {alias: ALIAS, targetId: 'target-1'},
    } as any);
    assert.strictEqual(result.url, '/json/close/target-1');
  });
});
