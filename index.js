const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const debug = require('debug')
const defaults = require('lodash/defaults')
const fetch = require('node-fetch')
const Router = require('express').Router
const SparqlHttpClient = require('sparql-http-client')
SparqlHttpClient.fetch = fetch

if (debug.enabled('trifid:*,')) {
  const enabled = debug.disable()
  debug.enable(`${enabled},sparql-proxy`)
}

const logger = debug('sparql-proxy')

const DEFAULT_TIMEOUT = 2000 // ms
function forwardStatusCode (statusCode) {
  switch (statusCode) {
    case 404:
      return 502
    case 500:
      return 502
  }
  return statusCode
}

function authBasicHeader (user, password) {
  return 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
}

function sparqlProxy (options) {
  const queryOptions = {}

  if (options.fetchOptions) {
    Object.assign(queryOptions, options.fetchOptions)
  }

  if (options.authentication) {
    queryOptions.headers = {
      Authorization: authBasicHeader(options.authentication.user, options.authentication.password)
    }
  }

  let queryOperation = options.queryOperation || 'postQueryDirect'
  const client = new SparqlHttpClient({ endpointUrl: options.endpointUrl })

  return (req, res, next) => {
    let query

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
    const currentQueryOptions = defaults(cloneDeep(queryOptions), { accept: req.headers.accept })

    const timeStart = Date.now()

    setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).send(`timeout after ${options.timeout} ms`)
      }
    }, options.timeout || DEFAULT_TIMEOUT)

    return client[queryOperation](query, currentQueryOptions).then((result) => {
      const time = Date.now() - timeStart
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
      } else if (reason.code === 'ENOTFOUND' || reason.code === 'ECONNRESET' || reason.code === 'ECONNREFUSED') {
        res.status(502).send(reason)
      } else {
        next()
      }
    })
  }
}

function factory (options) {
  const router = new Router()

  router.use(bodyParser.text({ type: 'application/sparql-query' }))
  router.use(bodyParser.urlencoded({ extended: false }))
  router.use(sparqlProxy(options))

  return router
}

module.exports = factory
