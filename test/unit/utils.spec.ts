import assert from 'node:assert/strict';
import os from 'node:os';
import {describe, it} from 'node:test';

import {fetchInterfaces, toSocketNameAlias} from '../../lib/utils.js';
import {replaceDeep} from '../../lib/utils.js';

describe('utils', function () {
  it('should compute a stable sha1 alias for a socket name', function () {
    const alias = toSocketNameAlias('@webview_devtools_remote_12345');
    assert.match(alias, /^[0-9a-f]{40}$/);
    assert.strictEqual(alias, toSocketNameAlias('@webview_devtools_remote_12345'));
    assert.notStrictEqual(alias, toSocketNameAlias('@webview_devtools_remote_67890'));
  });

  it('should filter network interfaces by family', function () {
    const allInterfaces = Object.values(os.networkInterfaces())
      .filter((list): list is os.NetworkInterfaceInfo[] => Array.isArray(list))
      .flat();
    const expectedV4 = allInterfaces.filter(({family}) => [4, 'IPv4'].includes(family as any));
    const expectedV6 = allInterfaces.filter(({family}) => [6, 'IPv6'].includes(family as any));

    assert.deepStrictEqual(fetchInterfaces(4), expectedV4);
    assert.deepStrictEqual(fetchInterfaces(6), expectedV6);
    assert.deepStrictEqual(fetchInterfaces(null), allInterfaces);
  });

  it('should perform deep replacement', function () {
    const replaceMap: [string | RegExp, string][] = [
      [
        'ws://localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734',
        'wss://yolo:9222/session/devtools/page/DAB7FB6187B554E10B0BD18821265734',
      ],
      [
        'ws://localhost:9222/devtools/browser/b0b8a4fb-bb17-4359-9533-a8d9f3908bd8',
        'wss://yolo:9222/session/devtools/browser/b0b8a4fb-bb17-4359-9533-a8d9f3908bd8',
      ],
      [
        'ws=localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734',
        'ws=yolo:9222/session/devtools/page/DAB7FB6187B554E10B0BD18821265734',
      ],
    ];
    assert.deepStrictEqual(
      replaceDeep(
        [
          {
            description: '',
            devtoolsFrontendUrl:
              '/devtools/inspector.html?ws=localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734',
            id: 'DAB7FB6187B554E10B0BD18821265734',
            title: 'Yahoo',
            type: 'page',
            url: 'https://www.yahoo.com/',
            webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734',
          },
          {
            Browser: 'Chrome/72.0.3601.0',
            'Protocol-Version': '1.3',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3601.0 Safari/537.36',
            'V8-Version': '7.2.233',
            'WebKit-Version': '537.36 (@cfede9db1d154de0468cb0538479f34c0755a0f4)',
            webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/b0b8a4fb-bb17-4359-9533-a8d9f3908bd8',
          },
        ],
        replaceMap,
      ),
      [
        {
          description: '',
          devtoolsFrontendUrl:
            '/devtools/inspector.html?ws=yolo:9222/session/devtools/page/DAB7FB6187B554E10B0BD18821265734',
          id: 'DAB7FB6187B554E10B0BD18821265734',
          title: 'Yahoo',
          type: 'page',
          url: 'https://www.yahoo.com/',
          webSocketDebuggerUrl: 'wss://yolo:9222/session/devtools/page/DAB7FB6187B554E10B0BD18821265734',
        },
        {
          Browser: 'Chrome/72.0.3601.0',
          'Protocol-Version': '1.3',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3601.0 Safari/537.36',
          'V8-Version': '7.2.233',
          'WebKit-Version': '537.36 (@cfede9db1d154de0468cb0538479f34c0755a0f4)',
          webSocketDebuggerUrl: 'wss://yolo:9222/session/devtools/browser/b0b8a4fb-bb17-4359-9533-a8d9f3908bd8',
        },
      ],
    );
  });
});
