/* global describe, it */

const assert = require('assert')
const express = require('express')
const nock = require('nock')
const request = require('supertest')
const sparqlProxy = require('..')

describe('sparql-proxy', () => {
  const query = 'SELECT * WHERE {?s ?p ?o.} LIMIT 10'

  it('should be a function', () => {
    assert.equal(typeof sparqlProxy, 'function')
  })

  it('should proxy GET query requests', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query'
    }))

    nock('http://example.org').post('/get/query').reply(200, function (uri, body) {
      return body
    })

    return request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
      .then((res) => {
        assert.equal(res.text, query)
      })
  })

  it('should proxy URL encoded POST query requests', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/post-url-encoded/query'
    }))

    nock('http://example.org').post('/post-url-encoded/query').reply(200, function (uri, body) {
      return body
    })

    return request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
      .then((res) => {
        assert.equal(res.text, query)
      })
  })

  it('should proxy direct POST query requests', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/post-url-encoded/query'
    }))

    nock('http://example.org').post('/post-url-encoded/query').reply(200, function (uri, body) {
      return body
    })

    return request(app)
      .post('/query')
      .set('content-type', 'application/sparql-query')
      .send(query)
      .expect(200)
      .then((res) => {
        assert.equal(res.text, query)
      })
  })

  it('should use authentication if given', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/authentication/query',
      authentication: {
        user: 'user',
        password: 'password'
      }
    }))

    nock('http://example.org').post('/authentication/query').reply(200, function (uri, body) {
      return this.req.headers.authorization[0]
    })

    return request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
      .then((res) => {
        assert.equal(res.text, 'Basic dXNlcjpwYXNzd29yZA==')
      })
  })

  it('should forward header from endpoint', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/forward-headers/query',
      authentication: {
        user: 'user',
        password: 'password'
      }
    }))

    nock('http://example.org').post('/forward-headers/query').reply(200, query, {'endpoint-header': 'test'})

    return request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
      .then((res) => {
        assert.equal(res.headers['endpoint-header'], 'test')
      })
  })

  it('should ignore unknown methods', () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/unknown-method/query'
    }))

    return request(app)
      .put('/query')
      .set('content-type', 'application/sparql-query')
      .send(query)
      .expect(404)
  })
})
