import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {DevtoolsPlugin} from '../../lib/plugin.js';

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
});
