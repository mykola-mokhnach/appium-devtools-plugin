import _ from 'lodash';
import crypto from 'node:crypto';
import os from 'node:os';

export const V4_BROADCAST_IP = '0.0.0.0';
export const V6_BROADCAST_IP = '::';

/**
 *
 * @param {string} socketName
 * @returns {string}
 */
export function toSocketNameAlias(socketName) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(socketName);
  return sha1sum.digest('hex');
}

/**
 * Fetches the list of matched network interfaces of the current host.
 *
 * @param {4|6|null} family Either 4 to include ipv4 addresses only,
 * 6 to include ipv6 addresses only, or null to include all of them
 * @returns {os.NetworkInterfaceInfo[]} The list of matched interfcaes
 */
export function fetchInterfaces (family = null) {
  let familyValue = null;
  // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
  if (family === 4) {
    familyValue = [4, 'IPv4'];
  } else if (family === 6) {
    familyValue = [6, 'IPv6'];
  }
  // @ts-ignore The linter does not understand the below filter
  return _.flatMap(_.values(os.networkInterfaces()).filter(Boolean))
    // @ts-ignore The linter does not understand the above filter
    .filter(({family}) => !familyValue || familyValue && familyValue.includes(family));
}

/**
 *
 * @template T
 * @param {T} obj
 * @param {[string|RegExp, string][]} replaceMap
 * @returns {T}
 */
export function replaceDeep (obj, replaceMap) {
  const doReplace = (val) => {
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
    // @ts-ignore This is expected
    return _.reduce(obj, (result, value, key) => {
      result[doReplace(key)] = replaceDeep(value, replaceMap);
      return result;
    }, {});
  }
  if (_.isArray(obj)) {
    // @ts-ignore This is expected
    return obj.map((x) => replaceDeep(x, replaceMap));
  }
  if (_.isString(obj)) {
    return doReplace(obj);
  }
  return obj;
}
