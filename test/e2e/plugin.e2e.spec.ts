import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {waitForCondition} from 'asyncbox';
import axios from 'axios';
import {remote as wdio} from 'webdriverio';
import type {Browser} from 'webdriverio';
import WebSocket from 'ws';

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

const CHROME_PACKAGE = 'com.android.chrome';
const CHROME_DEVTOOLS_SOCKET = '@chrome_devtools_remote';
const TEST_PAGE_URL = 'https://example.com/';
const TEST_PAGE_TITLE = 'Example Domain';

interface DevtoolsPage {
  id: string;
  url: string;
  title: string;
  webSocketDebuggerUrl: string;
}

interface DevtoolsTarget {
  name: string;
  pages: DevtoolsPage[];
  info: Record<string, any>;
  isProxied: boolean;
  proxyInfo: {uuid: string; alias: string; name: string; root: string} | null;
}

/**
 * Sends a single Chrome DevTools Protocol command over the given websocket
 * URL and resolves with its result. Used to prove that the plugin's websocket
 * proxying works end to end, and not only its plain HTTP endpoints.
 */
function sendCdpCommand(wsUrl: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = 1;
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out waiting for a response to '${method}'`));
    }, 10000);
    ws.once('open', () => ws.send(JSON.stringify({id, method, params})));
    ws.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.id !== id) {
        return;
      }
      clearTimeout(timer);
      ws.close();
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    });
  });
}

describe('DevtoolsPlugin', function () {
  let driver: Browser;

  beforeEach(async function () {
    driver = await wdio(WDIO_OPTS);
  });

  afterEach(async function () {
    if (driver) {
      // Leave no tabs behind, so a repeated local run does not have to guess
      // which of several same-URL tabs is the one it just opened.
      await driver.execute('mobile: terminateApp', {appId: CHROME_PACKAGE}).catch(() => {});
      await driver.deleteSession();
    }
  });

  it('should discover, proxy and tear down a live Chrome devtools target', async function () {
    // Start from a single-tab Chrome instance so the freshly opened page can
    // be identified unambiguously, even on a device where Chrome's first-run
    // experience (sign-in / notifications promo) is still being dismissed.
    await driver.execute('mobile: shell', {command: 'am', args: ['force-stop', CHROME_PACKAGE]});
    // On Android 13+, Chrome shows a notification-permission rationale dialog
    // on its first launch unless POST_NOTIFICATIONS is already granted, in
    // which case it skips the prompt entirely. Best-effort: the permission
    // does not exist pre-Android 13 (the API level this plugin's CI targets),
    // where this is a harmless no-op.
    await driver
      .execute('mobile: shell', {
        command: 'pm',
        args: ['grant', CHROME_PACKAGE, 'android.permission.POST_NOTIFICATIONS'],
      })
      .catch(() => {});
    await driver.executeScript('mobile: startActivity', [
      {
        component: `${CHROME_PACKAGE}/com.google.android.apps.chrome.Main`,
        uri: TEST_PAGE_URL,
      },
    ]);

    const {target, pageId} = (await waitForCondition(
      async () => {
        const {targets} = (await driver.executeScript('devtools: listTargets', [])) as {
          targets: DevtoolsTarget[];
        };
        const chromeTarget = targets.find(({name}) => name === CHROME_DEVTOOLS_SOCKET);
        const page = chromeTarget?.pages.find(({url, title}) => url === TEST_PAGE_URL && title === TEST_PAGE_TITLE);
        return page ? {target: chromeTarget, pageId: page.id} : false;
      },
      {
        waitMs: 30000,
        intervalMs: 500,
      },
    )) as unknown as {target: DevtoolsTarget; pageId: string};
    assert.equal(target.isProxied, false);
    assert.equal(target.proxyInfo, null);

    const proxyInfo = (await driver.executeScript('devtools: proxyTarget', [{name: CHROME_DEVTOOLS_SOCKET}])) as {
      uuid: string;
      alias: string;
      name: string;
      root: string;
    };
    assert.equal(proxyInfo.name, CHROME_DEVTOOLS_SOCKET);
    assert.match(proxyInfo.root, /^https?:\/\//);

    try {
      const {data: versionInfo} = await axios.get(`${proxyInfo.root}/json/version`);
      assert.match(versionInfo.Browser, /^Chrome\//);
      assert.ok(
        versionInfo.webSocketDebuggerUrl.includes(proxyInfo.uuid),
        `Expected the browser debugger URL to be rewritten to point back to the Appium server: ${versionInfo.webSocketDebuggerUrl}`,
      );

      const {data: pages} = await axios.get(`${proxyInfo.root}/json/list`);
      const page = (pages as DevtoolsPage[]).find((p) => p.id === pageId);
      assert.ok(page, `Expected a page with id '${pageId}' in ${JSON.stringify(pages)}`);
      assert.equal(page.url, TEST_PAGE_URL);
      assert.equal(page.title, TEST_PAGE_TITLE);
      assert.ok(
        page.webSocketDebuggerUrl.includes(proxyInfo.uuid),
        `Expected the page debugger URL to be rewritten to point back to the Appium server: ${page.webSocketDebuggerUrl}`,
      );

      // Exercise the websocket proxy itself, not only the HTTP endpoints.
      const evalResult = await sendCdpCommand(page.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: 'document.title',
      });
      assert.equal(evalResult.result.value, TEST_PAGE_TITLE);
    } finally {
      await driver.executeScript('devtools: unproxyTarget', [{name: CHROME_DEVTOOLS_SOCKET}]);
    }

    const {targets: targetsAfterUnproxy} = (await driver.executeScript('devtools: listTargets', [])) as {
      targets: DevtoolsTarget[];
    };
    const targetAfterUnproxy = targetsAfterUnproxy.find(({name}) => name === CHROME_DEVTOOLS_SOCKET);
    assert.ok(targetAfterUnproxy);
    assert.equal(targetAfterUnproxy.isProxied, false);
    assert.equal(targetAfterUnproxy.proxyInfo, null);

    // The alias is gone once unproxied, so the old proxy root must stop responding.
    await assert.rejects(axios.get(`${proxyInfo.root}/json/version`), (e: any) => e.response?.status === 404);
  });
});
