const crypto = require('crypto')
const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const debug = require('debug')
const defaults = require('lodash/defaults')
const fetch = require('node-fetch')
const Router = require('express').Router
const { createClient } = require('redis')
const SparqlHttpClient = require('sparql-http-client')
SparqlHttpClient.fetch = fetch

if (debug.enabled('trifid:*,')) {
  const enabled = debug.disable()
  debug.enable(`${enabled},sparql-proxy`)
}

const logger = debug('sparql-proxy')

const forwardStatusCode = (statusCode) => {
  switch (statusCode) {
    case 404:
      return 502
    case 500:
      return 502
  }
  return statusCode
}

const authBasicHeader = (user, password) => {
  return 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
}

const sha1 = (data) => {
  return crypto.createHash('sha1').update(data, 'binary').digest('hex')
}

const getRedisClient = async (options) => {
  const { url, ttl, clearAtStartup, disabled, prefix } = options
  if (!url || disabled) {
    return null
  }
  logger(`Cache: enabled.`)

  const cachePrefix = prefix || 'default'
  const cacheTtl = ttl ? parseInt(`${ttl}`, 10) : 60 * 60

  const client = createClient({ url })

  // try the connection, and crash if it is not working
  await client.connect()
  await client.ping()

  // remove all cache entries at startup if configured that way
  if (clearAtStartup && clearAtStartup !== 'false') {
    logger(`Cache: remove all entries in Redis that match the following pattern: '${cachePrefix}:*'…`)
    for await (const key of client.scanIterator({
      MATCH: `${cachePrefix}:*`
    })) {
      logger(`Cache: removing '${key}' entry…`)
      await client.del(key)
    }
    logger(`Cache: removed all entries in Redis that match the following pattern: '${cachePrefix}:*'. Done!`)
  }

  return {
    client,
    ttl: cacheTtl,
    prefix: cachePrefix
  }
}

const cacheKeyName = (prefix, name) => {
  return `${prefix}:${name}`
}

const sparqlProxy = (options) => {
  const queryOptions = {}

  if (options.fetchOptions) {
    Object.assign(queryOptions, options.fetchOptions)
  }

  if (options.authentication) {
    queryOptions.headers = {
      Authorization: authBasicHeader(options.authentication.user,
        options.authentication.password)
    }
  }

  // init cache
  let cacheTtl = 0
  let cachePrefix = 'default'
  let cacheClient = null

  let queryOperation = options.queryOperation || 'postQueryDirect'
  const client = new SparqlHttpClient({ endpointUrl: options.endpointUrl })

  const redisClientPromise = getRedisClient(options.cache || {}).catch((reason) => {
    console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to init cache', reason)
  })

  return async (req, res, next) => {
    let query

    let cacheEnabled = false
    let cacheKey = `${cachePrefix}:default`
    try {
      const redisClient = await redisClientPromise
      if (redisClient) {
        cacheTtl = redisClient.ttl
        cachePrefix = redisClient.prefix
        cacheClient = redisClient.client
        cacheEnabled = true
      }
    } catch (e) {
      console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to init cache', e)
    }

    if (req.method === 'GET') {
      query = req.query.query
    } else if (req.method === 'POST') {
      query = req.body.query || req.body
    } else {
      next()
      return
    }

    logger('handle SPARQL request for endpoint: ' + options.endpointUrl)
    if (query) {
      logger('SPARQL query:' + query)
    } else {
      logger('No SPARQL query; issuing a GET')
      queryOperation = 'getQuery'
      cacheEnabled = false
    }

    // merge configuration query options with request query options
    const currentQueryOptions = defaults(cloneDeep(queryOptions),
      { accept: req.headers.accept })

    const timeStart = Date.now()

    if (options.timeout) {
      setTimeout(() => {
        if (!res.headersSent) {
          res.status(504).send(`timeout after ${options.timeout} ms`)
        }
      }, options.timeout)
    }

    if (cacheEnabled) {
      cacheKey = cacheKeyName(cachePrefix, sha1(query))
      const cacheResponse = await cacheClient.get(cacheKey)
      const jsonResponse = JSON.parse(cacheResponse)
      if (cacheResponse) {
        const cacheData = jsonResponse.data || ''
        const cacheHeaders = jsonResponse.headers || {}
        const cacheStatus = jsonResponse.status || 500
        Object.entries(cacheHeaders).forEach((header) => {
          res.setHeader(header[0], header[1])
        })

        // content gets decoded, so remove encoding headers and recalculate length
        res.removeHeader('content-encoding')
        res.removeHeader('content-length')

        res.status(forwardStatusCode(cacheStatus))
        logger(`cache: use response from '${cacheKey}' entry: ${cacheData}`)
        res.send(cacheData)

        return
      }
    }

    return client[queryOperation](query, currentQueryOptions).then(async (result) => {
      const time = Date.now() - timeStart

      // store results in cache, but don't make the app crash in case of issue
      try {
        if (cacheClient && result.status < 400) {
          const responseText = await result.clone().text()
          const responseHeaders = {}
          result.headers.forEach((value, name) => {
            responseHeaders[name] = value
          })
          await cacheClient.set(cacheKey, JSON.stringify({
            headers: responseHeaders,
            status: result.status,
            data: responseText
          }))
          await cacheClient.expire(cacheKey, cacheTtl)
        }
      } catch (e) {
        console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to save the entry in cache', e)
      }

      result.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })

      // content gets decoded, so remove encoding headers and recalculate length
      res.removeHeader('content-encoding')
      res.removeHeader('content-length')

      res.status(forwardStatusCode(result.status))
      result.body.pipe(res)
      if (debug.enabled('sparql-proxy')) {
        return result.text().then((text) => {
          logger(`HTTP${result.status} in ${time}ms; body: ${text}`)
        })
      }
    }).catch((reason) => {
      if (reason.code === 'ETIMEDOUT') {
        res.status(504).send(reason)
      } else if (reason.code === 'ENOTFOUND' || reason.code === 'ECONNRESET' ||
        reason.code === 'ECONNREFUSED') {
        res.status(502).send(reason)
      } else {
        next()
      }
    })
  }
}

const factory = (options) => {
  const router = new Router()

  router.use(bodyParser.text({ type: 'application/sparql-query' }))
  router.use(bodyParser.urlencoded({ extended: false }))
  router.use(sparqlProxy(options))

  return router
}

module.exports = factory
