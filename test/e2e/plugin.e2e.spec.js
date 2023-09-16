import {remote as wdio} from 'webdriverio';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.should();
chai.use(chaiAsPromised);

const TEST_CAPS = {
  platformName: 'Android',
  'appium:automationName': 'uiautomator2',
};
const WDIO_OPTS = {
  hostname: process.env.APPIUM_TEST_SERVER_HOST ?? '127.0.0.1',
  port: parseInt(process.env.APPIUM_TEST_SERVER_PORT ?? '', 10) || 4723,
  connectionRetryCount: 0,
  capabilities: TEST_CAPS,
};

describe('DevtoolsPlugin', function () {
  /** @type {import('webdriverio').Browser} */
  let driver;

  beforeEach(async function () {
    driver = await wdio(WDIO_OPTS);
  });

  afterEach(async function () {
    if (driver) {
      await driver.deleteSession();
    }
  });

  it('should list web views', async function () {
    await driver.executeScript('mobile: startActivity', [{
      component: 'com.android.chrome/com.google.android.apps.chrome.Main',
      uri: 'https://google.com',
    }]);
    const {targets} = await driver.executeScript('devtools: listTargets', []);
    targets.length.should.be.greaterThan(0);
  });
});
