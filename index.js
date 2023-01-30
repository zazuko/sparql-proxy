const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const debug = require('debug')
const defaults = require('lodash/defaults')
const fetch = require('node-fetch')
const Router = require('express').Router
const { sha1 } = require('./src/utils')
const { standardizeResponse } = require('./src/response')
const { getRedisClient, cacheKeyName, cacheResult } = require('./src/cache')
const SparqlHttpClient = require('sparql-http-client')
SparqlHttpClient.fetch = fetch

if (debug.enabled('trifid:*,')) {
  const enabled = debug.disable()
  debug.enable(`${enabled},sparql-proxy`)
}

const logger = debug('sparql-proxy')

/**
 * Generate the value for the Authorization header for basic authentication.
 *
 * @param {string} user The username.
 * @param {string} password The password of that user.
 * @returns {string} The value of the Authorization to use.
 */
const authBasicHeader = (user, password) => {
  const base64String = Buffer.from(`${user}:${password}`).toString('base64')
  return `Basic ${base64String}`
}

const sparqlProxy = (options) => {
  const queryOptions = {}

  if (options.fetchOptions) {
    Object.assign(queryOptions, options.fetchOptions)
  }

  if (options.authentication) {
    queryOptions.headers = {
      Authorization: authBasicHeader(
        options.authentication.user,
        options.authentication.password
      )
    }
  }

  let queryOperation = options.queryOperation || 'postQueryDirect'
  const client = new SparqlHttpClient({ endpointUrl: options.endpointUrl })

  // init cache
  let cacheTtl = 0
  let cachePrefix = 'default'
  let cacheClient = null
  const redisClientPromise = getRedisClient(logger, options.cache || {}).catch((reason) => {
    console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to init cache', reason)
  })

  return async (req, res, next) => {
    let query

    let cacheKey = `${cachePrefix}:default`
    try {
      const redisClient = await redisClientPromise
      if (redisClient) {
        cacheTtl = redisClient.ttl
        cachePrefix = redisClient.prefix
        cacheClient = redisClient.client.duplicate()
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

    // if the cache client is configured
    if (cacheClient) {
      cacheKey = query
        ? cacheKeyName(cachePrefix, sha1(query))
        : cacheKeyName(cachePrefix, 'get-query')

      try {
        // try to get the result from the cache
        await cacheClient.connect()
        const cacheResponse = await cacheClient.get(cacheKey)
        await cacheClient.disconnect()

        // if the cache contains the entry
        if (cacheResponse) {
          const jsonResponse = JSON.parse(cacheResponse)
          const cacheData = jsonResponse.data || ''
          const cacheHeaders = jsonResponse.headers || {}
          const cacheStatus = jsonResponse.status || 500
          Object.entries(cacheHeaders).forEach((header) => {
            res.setHeader(header[0], header[1])
          })

          logger(`cache: use response from '${cacheKey}' entry: ${cacheData}`)
          standardizeResponse(res, cacheStatus)
          res.send(cacheData)

          return
        }

        // if not, continue to run the code
      } catch (e) {
        console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to get cache entry', e)
      }
    }

    // if the query was not cached, then we run it against the triplestore endpoint
    return client[queryOperation](query, currentQueryOptions).then(async (result) => {
      const time = Date.now() - timeStart

      // store results in cache, but don't make the app crash in case of issue
      try {
        await cacheResult(cacheClient, result.clone(), cacheKey, cacheTtl)
      } catch (e) {
        console.error('ERROR[sparql-proxy/cache]: something went wrong while trying to save the entry in cache', e)
      }

      result.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })

      standardizeResponse(res, result.status)
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
