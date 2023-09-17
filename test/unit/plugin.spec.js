import _ from 'lodash';
import { DevtoolsPlugin } from '../../lib/plugin';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.should();
chai.use(chaiAsPromised);

describe('DevtoolsPlugin', function () {
  /** @type {DevtoolsPlugin} */
  let plugin;
  const driverWithAdb = {
    adb: {},
  };
  const driverWoAdb = _.omit(driverWithAdb, 'adb');

  beforeEach(function () {
    plugin = new DevtoolsPlugin('devtools');
  });

  it('should init properties after session creation', async function () {
    _.isNil(plugin.driver).should.be.true;
    await plugin.handle(_.noop, driverWithAdb, 'createSession');
    _.isNil(plugin.driver).should.be.false;
  });
  it('should reset properties after session deletion', async function () {
    await plugin.handle(_.noop, driverWithAdb, 'createSession');
    await plugin.handle(_.noop, driverWithAdb, 'deleteSession');
    _.isNil(plugin.driver).should.be.true;
  });
  it('should init properties after session creation if the driver has no adb', async function () {
    _.isNil(plugin.driver).should.be.true;
    await plugin.handle(_.noop, driverWoAdb, 'createSession');
    _.isNil(plugin.driver).should.be.true;
  });
});
