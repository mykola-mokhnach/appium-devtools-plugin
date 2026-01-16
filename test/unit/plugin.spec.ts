import _ from 'lodash';
import { DevtoolsPlugin } from '../../lib/plugin';
import { expect } from 'chai';

describe('DevtoolsPlugin', function () {
  let plugin: DevtoolsPlugin;
  const driverWithAdb = {
    adb: {},
  };
  const driverWoAdb = _.omit(driverWithAdb, 'adb');

  beforeEach(function () {
    plugin = new DevtoolsPlugin('devtools');
  });

  it('should init properties after session creation', async function () {
    expect(_.isNil(plugin.driver)).to.be.true;
    await plugin.handle(_.noop, driverWithAdb as any, 'createSession');
    expect(_.isNil(plugin.driver)).to.be.false;
  });
  it('should reset properties after session deletion', async function () {
    await plugin.handle(_.noop, driverWithAdb as any, 'createSession');
    await plugin.handle(_.noop, driverWithAdb as any, 'deleteSession');
    expect(_.isNil(plugin.driver)).to.be.true;
  });
  it('should init properties after session creation if the driver has no adb', async function () {
    expect(_.isNil(plugin.driver)).to.be.true;
    await plugin.handle(_.noop, driverWoAdb as any, 'createSession');
    expect(_.isNil(plugin.driver)).to.be.true;
  });
});
