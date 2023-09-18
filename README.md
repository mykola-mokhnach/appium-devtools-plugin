# Appium Devtools Plugin

This plugin is created to expose [Chrome Devtools Protocol](https://chromedevtools.github.io/devtools-protocol/) API from a **mobile Android** browser or a webview to the running Appium server.
Afterwards this API could be used to establish a connection to it from an external client and to
perform an extended automation, like [performance metrics gathering](https://www.selenium.dev/documentation/webdriver/bidirectional/chrome_devtools/#collect-performance-metrics) or [geolocation emulation](https://www.selenium.dev/documentation/webdriver/bidirectional/chrome_devtools/#emulate-geo-location-with-the-remote-webdriver).

## Features

* Adds the following execute methods:
  - [devtools: listTargets](#devtools-listtargets)
  - [devtools: proxyTarget](#devtools-proxytarget)
  - [devtools: unproxyTarget](#devtools-unproxytarget)
* Adds the following server HTTP endpoints:
  - GET /cdp/:uuid/:alias/json/version
  - GET /cdp/:uuid/:alias/json/list
  - GET /cdp/:uuid/:alias/json/
  - GET /cdp/:uuid/:alias/json/protocol
  - PUT /cdp/:uuid/:alias/json/new
  - GET /cdp/:uuid/:alias/json/activate/:targetId
  - GET /cdp/:uuid/:alias/json/close/:targetId
  - GET /cdp/:uuid/:alias/devtools/inspector.html
* Adds the following Websocket endpoints
  - /cdp/:uuid/:alias/devtools/browser
  - /cdp/:uuid/:alias/devtools/browser/:browserId
  - /cdp/:uuid/:alias/devtools/page/:pageId

## Prerequisites

* Appium Server 2.0+
* [UIAutomator2](https://github.com/appium/appium-uiautomator2-driver) or [Espresso](https://github.com/appium/appium-espresso-driver) driver

## Installation - Server

Install the plugin using Appium's plugin CLI:

```
appium plugin install --source npm appium-devtools-plugin
```

## Installation - Client

On the client side this plugin requires a proper the [Chrome Devtools Protocol](https://chromedevtools.github.io/devtools-protocol/) client implementation. For example, it should be included into the [Selenium Java library](https://github.com/SeleniumHQ/selenium/tree/trunk/java/src/org/openqa/selenium/devtools).

## Activation

The plugin will not be active unless turned on when invoking the Appium server:

```
appium --use-plugins=devtools
```

## Execute Methods

### devtools: listTargets

Scans if there are any active CDP sockets in the system and exposes the list of such sockets with their properties. Also, the API exposes which sockets are currently being proxied and which are not.

#### Returned Result

An object with a single `targets` property. This is a list of entries, where each has the following properties:

Name | Type | Description | Example
--- | --- | --- | ---
name | string | The name of the CDP socket. Usually starts with `@` | @chrome_devtools_remote
pages | map[] | The list of pages in this webview. The output of [/json/list](https://chromedevtools.github.io/devtools-protocol/) endpoint | [ {"description": "", "devtoolsFrontendUrl": "/devtools/inspector.html?ws=localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734", "id": "DAB7FB6187B554E10B0BD18821265734", "title": "Yahoo", "type": "page", "url": "https://www.yahoo.com/", "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734"} ]
info | map | The basic information about the current webview. This is the output of [/json/version](https://chromedevtools.github.io/devtools-protocol/) endpoint | {"Browser": "Chrome/72.0.3601.0", "Protocol-Version": "1.3", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3601.0 Safari/537.36", "V8-Version": "7.2.233", "WebKit-Version": "537.36 (@cfede9db1d154de0468cb0538479f34c0755a0f4)", "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/b0b8a4fb-bb17-4359-9533-a8d9f3908bd8"}
isProxied | boolean | Whether the current webview is being proxied | false
proxyInfo | map | The proxy information if the webview is being proxied, which consists of the following entries: `alias`, `name`, `root`, `uuid`. It is always `null` if `isProxied` is false. | {"alias":"1ca57bc449240dfeb716e8a5adb95849bcfdd49f","name":"@chrome_devtools_remote","uuid": "ed3c4d2f-7b34-4563-9a3c-e6af20418500", "root":"http://127.0.0.1:4723/cdp/ed3c4d2f-7b34-4563-9a3c-e6af20418500/1ca57bc449240dfeb716e8a5adb95849bcfdd49f"}

### devtools: proxyTarget

Starts the proxy for the given CDP target name. An exception is thrown if the target is already being proxied or does not exist.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the webview socket to proxy. Usually starts with `@`. Could be retrieved from [devtools: listTargets](#devtools-listtargets) output | @chrome_devtools_remote
port | number | no | The port number on the Appium server machine to be used for the proxy. The port must not be in use. If not provided then a random free port from the [15900, 16000] range will be selected. | 12345

#### Returned Result

If the corresponding CDP API has been forwarded successfully then the following map is returned

Name | Type | Description | Example
--- | --- | --- | ---
name | string | The name of the webview being forwarded | @chrome_devtools_remote
alias | string | Unique alias for the given webview name. It is used to construct the forward URL | 1ca57bc449240dfeb716e8a5adb95849bcfdd49f
uuid | string | The unique identifier of the current plugin instance. It is used to construct the forward URL | ed3c4d2f-7b34-4563-9a3c-e6af20418500
root | string | The forwarding root URL used as a base for all CDP endpoints | http://127.0.0.1:4723/cdp/ed3c4d2f-7b34-4563-9a3c-e6af20418500/1ca57bc449240dfeb716e8a5adb95849bcfdd49f

### devtools: unproxyTarget

Stops the proxy for the given CDP target name. An exception is thrown if the target is not being proxied or does not exist.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the webview socket to stop the proxy for. Usually starts with `@`. Could be retrieved from [devtools: listTargets](#devtools-listtargets) output | @chrome_devtools_remote

## Usage

```java

private AndroidDriver driver;
private static final Pattern BROWSER_MAJOR_VER_PATTERN = Pattern.compile("/(\\d+)");

@BeforeEach
void setup() {
  // Espresso driver is supported as well
  UiAutomator2Options options = new UiAutomator2Options();
  driver = new AndroidDriver(options);
}

@AfterEach
void teardown(){
  driver.quit();
}

private DevTools initDevTools(URI uri, String browserMajorVersion) {
  HttpClient.Factory factory = HttpClient.Factory.createDefault();
  HttpClient client = CdpEndpointFinder.getHttpClient(factory, uri);
  URI cdpUri = CdpEndpointFinder.getCdpEndPoint(client);
  Connection connection = new Connection(client, cdpUri.toString());
  CdpInfo cdpInfo = new CdpVersionFinder()
    .match(browserMajorVersion)
    .orElseThrow(
      () -> new RuntimeException(
        String.format(
          "Unable to find version of CDP to use for %s. You may need to include a"
              + " dependency on a specific version of the CDP using something"
              + " similar to `org.seleniumhq.selenium:selenium-devtools-v86:%s`"
              + " where the version (\"v86\") matches the version of the"
              + " chromium-based browser you're using and the version number of the"
              + " artifact is the same as Selenium's.",
          browserMajorVersion, new BuildInfo().getReleaseLabel()
        )
      );
    );
  return new DevTools(cdpInfo::getDomains, connection);
}

private String extractMajorBrowserVersion(String version) {
  Matcher matcher = BROWSER_MAJOR_VER_PATTERN.matcher(version);
  if (!matcher.find()) {
    throw new RuntimeException(String.format(
      "No major browser version could be parsed from '%s'", version
    ));
  }
  return matcher.group(1);
}

@Test
void verifyMobileCdp() {
  // ....
  // manipulate the App under test or the browser, so a web view is active
  // ....
  Map<String, Object> wvInfo = (Map<String, Object>) driver.executeScript("devtools: listTargets");
  List<Map<String, Object>> targets = (List<Map<String, Object>>) wvInfo.get("targets");
  // There might be multiple targets or none
  // depending on which web views are currently active and debuggable.
  // We just want to interact with the very first one in this example
  Map<String, Object> target = (Map<String, Object>) targets.get(0);
  String wvName = (String) target.get("name");
  Map<String, Object> proxyInfo = (Map<String, Object>) driver.executeScript(
    "devtools: proxyTarget",
    Map.of("name", wvName)
  );

  // Ususally, it looks like "Chrome/91.0.4472.114"
  String browserVersion = (String) target.get("Browser");
  try {
    DevTools devtools = initDevtools(
      Uri.parse((String) proxyInfo.get("root")),
      extractMajorBrowserVersion(browserVersion)
    );

    devTools.createSession();
    devTools.send(Network.clearBrowserCookies());
    devTools.send(Network.setCacheDisabled(true));
    // ...
    // Continue doing crazy stuff with the devtools object
    // ...
  } finally {
    // This will be done anyway automatically upon quitting the driver
    driver.executeScript(
      "devtools: unproxyTarget",
      Map.of("name", wvName)
    );
  }
}
```
