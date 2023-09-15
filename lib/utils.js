import _ from 'lodash';
import crypto from 'node:crypto';

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
      result = result.replace(r1, r2);
    }
    return result;
  };

  if (_.isPlainObject(obj)) {
    return _.reduce(obj, (result, value, key) => {
      result[doReplace(key)] = replaceDeep(value, replaceMap);
      return result;
    }, {})
  }
  if (_.isArray(obj)) {
    return obj.map((x) => replaceDeep(x, replaceMap));
  }
  if (_.isString(obj)) {
    return doReplace(obj);
  }
  return obj;
}
