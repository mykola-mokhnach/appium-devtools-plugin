import type { AppiumServer } from '@appium/types';

export interface ProxyInfo {
  name: string;
  uuid: string;
  alias: string;
  root: string;
}

export interface ProxiedSession {
  name: string;
  alias: string;
  root: string;
  browserDebuggerPathname: string;
  pageDebuggerPathname: string;
  port: number;
  rewrites: [string | RegExp, string][];
}

export interface WebviewProps {
  info: Record<string, any>;
  pages: Record<string, any>[];
}

export interface DevtoolsTarget {
  info: Record<string, any>;
  pages: Record<string, any>[];
  name: string;
  isProxied: boolean;
  proxyInfo?: ProxyInfo | null;
}

export interface DevtoolsTargetsInfo {
  targets: DevtoolsTarget[];
}

export interface RequiredDriverProperties {
  adb: any;
  server: AppiumServer;
}
