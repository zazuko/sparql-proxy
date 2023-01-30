/**
 * Get the status code to forward.
 *
 * @param {number} statusCode The source status code.
 * @returns {number} status code.
 */
const forwardStatusCode = (statusCode) => {
  switch (statusCode) {
    case 404:
      return 502
    case 500:
      return 502
  }
  return statusCode
}

/**
 * Standardize response.
 *
 * @param {import('express').Response} res Response.
 */
const standardizeResponse = (res, statusCode) => {
  // content gets decoded, so remove encoding headers and recalculate length
  res.removeHeader('content-encoding')
  res.removeHeader('content-length')
  res.removeHeader('set-cookie')

  // forward a status code that make sense to the final user
  res.status(forwardStatusCode(statusCode))
}

module.exports = {
  standardizeResponse
}
