import {remote as wdio} from 'webdriverio';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { waitForCondition } from 'asyncbox';

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
    if (process.env.CI) {
      // Not sure how to get rid of Chrome Welcome screen in the CI env
      return this.skip();
    }

    await driver.executeScript('mobile: startActivity', [{
      component: 'com.android.chrome/com.google.android.apps.chrome.Main',
      uri: 'https://google.com',
    }]);
    await waitForCondition(async () => {
      const {targets} = await driver.executeScript('devtools: listTargets', []);
      return targets.length;
    }, {
      waitMs: 5000,
      intervalMs: 300,
    });
  });
});
