/* global describe, it */

const assert = require('assert')
const express = require('express')
const nock = require('nock')
const request = require('supertest')
const sparqlProxy = require('..')

describe('sparql-proxy', () => {
  const query = 'SELECT * WHERE {?s ?p ?o.} LIMIT 10'

  it('should be a function', () => {
    assert.strictEqual(typeof sparqlProxy, 'function')
  })

  it('should proxy GET query requests', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query'
    }))

    nock('http://example.org').post('/get/query').reply(200, (uri, body) => body)

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res.text, query)
  })

  it('should proxy with headers override', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query',
      fetchOptions: {
        headers: {
          'User-Agent': 'my-custom-ua'
        }
      }
    }))

    nock('http://example.org').post('/get/query').reply(
      200,
      (uri, body) => body,
      { 'query-ua': (req) => req.headers['user-agent'].join(' ') }
    )

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
      .expect('query-ua', 'my-custom-ua')
    assert.strictEqual(res.text, query)
  })

  it('should proxy GET with no query', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query'
    }))

    nock('http://example.org').get('/get/query').reply(200, () => 'Nothing')

    const res = await request(app)
      .get('/query')
      .expect(200)
    assert.strictEqual(res.text, 'Nothing')
  })

  it('should proxy URL encoded POST query requests', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/post-url-encoded/query'
    }))

    nock('http://example.org').post('/post-url-encoded/query').reply(200, (uri, body) => body)

    const res = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res.text, query)
  })

  it('should proxy direct POST query requests', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/post-url-encoded/query'
    }))

    nock('http://example.org').post('/post-url-encoded/query').reply(200, (uri, body) => body)

    const res = await request(app)
      .post('/query')
      .set('content-type', 'application/sparql-query')
      .send(query)
      .expect(200)
    assert.strictEqual(res.text, query)
  })

  it('should use authentication if given', async () => {
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

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res.text, 'Basic dXNlcjpwYXNzd29yZA==')
  })

  it('should forward header from endpoint', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/forward-headers/query',
      authentication: {
        user: 'user',
        password: 'password'
      }
    }))

    nock('http://example.org').post('/forward-headers/query').reply(200, query, { 'endpoint-header': 'test' })

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res.headers['endpoint-header'], 'test')
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

  it('should assign 502 when gets a 500 from server', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query'
    }))

    nock('http://example.org').post('/get/query').reply(500, (uri, body) => body)

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(502)
    assert.strictEqual(res.text, query)
  })

  it('should assign 502 when gets a 404 from server', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query'
    }))

    nock('http://example.org').post('/get/query').reply(404, (uri, body) => body)

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(502)
    assert.strictEqual(res.text, query)
  })

  it('should assign 504 for timeouts from endpoint', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/query',
      timeout: 200
    }))

    nock('http://example.org').post('/get/query').delayConnection(400).reply(200, (uri, body) => body)

    const res = await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(504)
    assert.strictEqual(res.text, 'timeout after 200 ms')
  })

  it('should assign 502 when endpoint is not reachable', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://non-reachable.org/404'
    }))

    await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(502)
  })

  it('should assign 502 when socket hangs up', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/get/reset'
    }))

    nock('http://example.org').post('/get/reset')
      .replyWithError({ code: 'ECONNRESET' })

    await request(app)
      .get('/query?query=' + encodeURIComponent(query))
      .expect(502)
  })
})
