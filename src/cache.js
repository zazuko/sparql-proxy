const { createClient } = require('redis')
const { toBoolean } = require('./utils')

/**
 * Get the Redis client or `null`.
 *
 * @param {debug.Debugger} logger Logger.
 * @param {*} options Caching options.
 * @returns Redis client or `null`.
 */
const getRedisClient = async (logger, options) => {
  const { url, ttl, clearAtStartup, disabled, prefix } = options
  if (!url || toBoolean(disabled)) {
    return null
  }
  logger('Cache: enabled.')

  const cachePrefix = prefix || 'default'
  const cacheTtl = ttl ? parseInt(`${ttl}`, 10) : 60 * 60

  const client = createClient({ url })

  // try the connection, and crash if it is not working
  await client.connect()
  await client.ping()

  // remove all cache entries at startup if configured that way
  if (toBoolean(clearAtStartup)) {
    logger(`Cache: remove all entries in Redis that match the following pattern: '${cachePrefix}:*'…`)
    for await (const key of client.scanIterator({
      MATCH: `${cachePrefix}:*`
    })) {
      logger(`Cache: removing '${key}' entry…`)
      await client.del(key)
    }
    logger(`Cache: removed all entries in Redis that match the following pattern: '${cachePrefix}:*'. Done!`)
  }
  await client.disconnect()

  return {
    client,
    ttl: cacheTtl,
    prefix: cachePrefix
  }
}

/**
 * Generate a cache key using a prefix.
 *
 * @param {string} prefix The prefix to use for the cache key.
 * @param {string} accept A deterministic value representing the Accept header.
 * @param {string} name The name of the key to use for the cache.
 * @returns {string} The prefixed cache key.
 */
const cacheKeyName = (prefix, accept, name) => {
  return `${prefix}:${accept}:${name}`
}

/**
 * Store an entry in the cache.
 *
 * @param {import('@redis/client').RedisClientType} cacheClient Redis client.
 * @param {string} responseText Response body.
 * @param {Response} result Response to store in the cache.
 * @param {string} cacheKey key for the cache entry.
 * @param {number} cacheTtl TTL for the cache entry.
 */
const cacheResult = async (cacheClient, responseText, result, cacheKey, cacheTtl) => {
  if (cacheClient && result.status < 400) {
    const responseHeaders = {}
    result.headers.forEach((value, name) => {
      responseHeaders[name] = value
    })

    await cacheClient.connect()
    await cacheClient.set(cacheKey, JSON.stringify({
      headers: responseHeaders,
      status: result.status,
      data: responseText
    }))
    await cacheClient.expire(cacheKey, cacheTtl)
    await cacheClient.disconnect()
  }
}

module.exports = {
  getRedisClient,
  cacheKeyName,
  cacheResult
}
