import _ from 'lodash';
import crypto from 'node:crypto';
import os from 'node:os';

export const V4_BROADCAST_IP = '0.0.0.0';
export const V6_BROADCAST_IP = '::';

/**
 * Converts a socket name to a unique alias by computing its SHA1 hash.
 *
 * @param socketName - The socket name to convert (e.g., '@webview_devtools_remote_12345')
 * @returns A hexadecimal SHA1 hash string representing the socket alias
 */
export function toSocketNameAlias(socketName: string): string {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(socketName);
  return sha1sum.digest('hex');
}

/**
 * Fetches the list of matched network interfaces of the current host.
 *
 * @param family Either 4 to include ipv4 addresses only,
 * 6 to include ipv6 addresses only, or null to include all of them
 * @returns The list of matched interfaces
 */
export function fetchInterfaces(family: 4 | 6 | null = null): os.NetworkInterfaceInfo[] {
  let familyValue: (4 | 6 | 'IPv4' | 'IPv6')[] | null = null;
  // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
  if (family === 4) {
    familyValue = [4, 'IPv4'];
  } else if (family === 6) {
    familyValue = [6, 'IPv6'];
  }
  return _.flatMap(_.values(os.networkInterfaces()).filter(Boolean))
    .filter(({family}) => !familyValue || (familyValue && familyValue.includes(family as any)));
}

/**
 * Recursively replaces string values in an object, array, or string using a map of patterns to replacements.
 * The replacement is applied to both keys and values, and works with nested structures.
 *
 * @template T
 * @param obj - The object, array, or string to perform replacements on
 * @param replaceMap - An array of tuples where each tuple contains a pattern (string or RegExp) and its replacement string
 * @returns A new object/array/string with all matching patterns replaced
 */
export function replaceDeep<T>(obj: T, replaceMap: [string | RegExp, string][]): T {
  const doReplace = (val: any): any => {
    if (!_.isString(val)) {
      return val;
    }

    let result = val;
    for (const [r1, r2] of replaceMap) {
      result = _.isString(r1) ? result.replaceAll(r1, r2) : result.replace(r1, r2);
    }
    return result;
  };

  if (_.isPlainObject(obj)) {
    return _.reduce(obj, (result: any, value, key) => {
      result[doReplace(key)] = replaceDeep(value, replaceMap);
      return result;
    }, {});
  }
  if (_.isArray(obj)) {
    return (obj as any[]).map((x) => replaceDeep(x, replaceMap)) as any;
  }
  if (_.isString(obj)) {
    return doReplace(obj) as any;
  }
  return obj;
}
