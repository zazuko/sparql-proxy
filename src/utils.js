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

/**
 * Convert a stream to a string, with a maximum length.
 *
 * @param {ReadableStream} stream The stream to read.
 * @param {number} limit The maximum length.
 * @returns {Promise<{length: number, text: string | null}>}
 */
const streamToText = (stream, limit = 0) => new Promise((resolve, reject) => {
  let text = ''
  let length = 0
  let overLimit = false

  stream.on('data', (data) => {
    const chunk = data.toString()
    length += chunk.length

    if (overLimit) return

    text += chunk

    if (limit && length > limit) {
      overLimit = true
    }
  })

  stream.on('end', () => {
    if (overLimit) {
      resolve({ length, text: null })
    } else {
      resolve({ length, text })
    }
  })

  stream.on('error', reject)
})

module.exports = {
  sha1,
  toBoolean,
  streamToText
}
