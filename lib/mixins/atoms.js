import axios from 'axios';
import {CDP_REQ_TIMEOUT_MS} from '../constants';

// https://chromedevtools.github.io/devtools-protocol/

/**
 *
 * @param {number} localPort
 * @returns {Promise<Record<string, any>[]>}
 */
export async function cdpList(localPort) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/list`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 *
 * @param {number} localPort
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpInfo(localPort) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/version`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 *
 * @param {number} localPort
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpProtocol(localPort) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/protocol`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 *
 * @param {number} localPort
 * @param {string?} [url]
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpOpenTab(localPort, tabUrl = null) {
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
 *
 * @param {number} localPort
 * @param {string} targetId
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpActivateTab(localPort, targetId) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/activate/${targetId}`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 *
 * @param {number} localPort
 * @param {string} targetId
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpCloseTab(localPort, targetId) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/json/close/${targetId}`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}

/**
 *
 * @param {number} localPort
 * @returns {Promise<Record<string, any>>}
 */
export async function cdpInspector(localPort) {
  return (
    await axios({
      url: `http://127.0.0.1:${localPort}/devtools/inspector.html`,
      timeout: CDP_REQ_TIMEOUT_MS,
    })
  ).data;
}
