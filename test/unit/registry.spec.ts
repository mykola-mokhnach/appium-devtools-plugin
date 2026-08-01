import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import type {DevtoolsPlugin} from '../../lib/plugin.js';
import {findPlugin, registerPlugin} from '../../lib/registry.js';

describe('registry', function () {
  it('should find a previously registered plugin by its uuid', function () {
    const plugin = {uuid: 'uuid-1'} as unknown as DevtoolsPlugin;
    registerPlugin(plugin);
    assert.strictEqual(findPlugin('uuid-1'), plugin);
  });

  it('should return null for an unknown uuid', function () {
    assert.strictEqual(findPlugin('does-not-exist'), null);
  });

  it('should not confuse plugins with different uuids', function () {
    const pluginA = {uuid: 'uuid-a'} as unknown as DevtoolsPlugin;
    const pluginB = {uuid: 'uuid-b'} as unknown as DevtoolsPlugin;
    registerPlugin(pluginA);
    registerPlugin(pluginB);
    assert.strictEqual(findPlugin('uuid-a'), pluginA);
    assert.strictEqual(findPlugin('uuid-b'), pluginB);
  });
});
