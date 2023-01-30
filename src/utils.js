const crypto = require('crypto')

/**
 * Get a boolean value from a string or a boolean.
 *
 * @param {boolean | string} value The value to check.
 * @returns {boolean} Boolean value.
 */
const toBoolean = (value) => {
  return `${value}`.toLocaleLowerCase() === 'true'
}

/**
 * Generate a SHA1 representation of a string.
 *
 * @param {string} data Data to encrypt using SHA1.
 * @returns SHA1 representation of the `data` string.
 */
const sha1 = (data) => {
  return crypto.createHash('sha1').update(data, 'binary').digest('hex')
}

module.exports = {
  sha1,
  toBoolean
}
