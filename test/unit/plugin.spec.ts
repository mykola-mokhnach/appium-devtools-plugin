import { DevtoolsPlugin } from '../../lib/plugin';
import { expect } from 'chai';

describe('DevtoolsPlugin', function () {
  let plugin: DevtoolsPlugin;
  const driverWithAdb = {
    adb: {},
  };
  const {adb: _ignored, ...driverWoAdb} = driverWithAdb;

  beforeEach(function () {
    plugin = new DevtoolsPlugin('devtools');
  });

  it('should init properties after session creation', async function () {
    expect(plugin.driver === null || plugin.driver === undefined).to.be.true;
    await plugin.handle(async () => {}, driverWithAdb as any, 'createSession');
    expect(plugin.driver === null || plugin.driver === undefined).to.be.false;
  });
  it('should reset properties after session deletion', async function () {
    await plugin.handle(async () => {}, driverWithAdb as any, 'createSession');
    await plugin.handle(async () => {}, driverWithAdb as any, 'deleteSession');
    expect(plugin.driver === null || plugin.driver === undefined).to.be.true;
  });
  it('should init properties after session creation if the driver has no adb', async function () {
    expect(plugin.driver === null || plugin.driver === undefined).to.be.true;
    await plugin.handle(async () => {}, driverWoAdb as any, 'createSession');
    expect(plugin.driver === null || plugin.driver === undefined).to.be.true;
  });
});
