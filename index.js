const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const defaults = require('lodash/defaults')
const fetch = require('node-fetch')
const Router = require('express').Router
const SparqlHttpClient = require('sparql-http-client')

SparqlHttpClient.fetch = fetch

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
      query = req.query.query || ''
    } else if (req.method === 'POST') {
      query = req.body.query || req.body
    } else {
      next()
      return
    }

    console.log('handle SPARQL request for endpoint: ' + options.endpointUrl)
    if (query) {
      console.log('SPARQL query:' + query)
    } else {
      console.log('No SPARQL query; issuing a GET')
      queryOperation = 'getQuery'
    }

    // merge configuration query options with request query options
    const currentQueryOptions = defaults(cloneDeep(queryOptions), { accept: req.headers.accept })

    return client[queryOperation](query, currentQueryOptions).then((result) => {
      result.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })

      // content gets decoded, so remove encoding headers and recalculate length
      res.removeHeader('content-encoding')
      res.removeHeader('content-length')

      result.body.pipe(res)
    }).catch(next)
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
