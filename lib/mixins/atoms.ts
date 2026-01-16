import axios from 'axios';
import {CDP_REQ_TIMEOUT_MS} from '../constants';

// https://chromedevtools.github.io/devtools-protocol/

/**
 * Fetches the list of available Chrome DevTools Protocol targets.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @returns A list of target information objects
 */
export async function cdpList(localPort: number): Promise<Record<string, any>[]> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/list`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Fetches version information from the Chrome DevTools Protocol endpoint.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @returns Version information object containing browser and protocol details
 */
export async function cdpInfo(localPort: number): Promise<Record<string, any>> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/version`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Fetches the complete Chrome DevTools Protocol schema.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @returns The complete protocol schema definition
 */
export async function cdpProtocol(localPort: number): Promise<Record<string, any>> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/protocol`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Opens a new tab in the browser via Chrome DevTools Protocol.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @param tabUrl - Optional URL to navigate to in the new tab
 * @returns Information about the newly created tab
 */
export async function cdpOpenTab(localPort: number, tabUrl: string | null = null): Promise<Record<string, any>> {
  const url = `http://127.0.0.1:${localPort}/json/new${tabUrl ? ('?' + encodeURIComponent(tabUrl)) : ''}`;
  return (
    await axios({
      method: 'PUT',
      url,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Activates (brings to focus) a specific tab by its target ID.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @param targetId - The unique identifier of the target tab to activate
 * @returns Result of the activation operation
 */
export async function cdpActivateTab(localPort: number, targetId: string): Promise<Record<string, any>> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/activate/${targetId}`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Closes a specific tab by its target ID.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @param targetId - The unique identifier of the target tab to close
 * @returns Result of the close operation
 */
export async function cdpCloseTab(localPort: number, targetId: string): Promise<Record<string, any>> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/close/${targetId}`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 * Fetches the DevTools inspector HTML page.
 *
 * @param localPort - The local port number where the CDP endpoint is accessible
 * @returns The HTML content of the DevTools inspector page
 */
export async function cdpInspector(localPort: number): Promise<Record<string, any>> {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/devtools/inspector.html`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}
