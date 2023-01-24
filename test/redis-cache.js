/* global describe, it */

const assert = require('assert')
const express = require('express')
const nock = require('nock')
const request = require('supertest')
const sparqlProxy = require('..')

describe('redis cache for sparql-proxy', () => {
  const query = 'SELECT * WHERE {?s ?p ?o.} LIMIT 10'

  it('should not crash even if redis is not recheable', async () => {
    const app = express()

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/post-url-encoded/query',
      cache: {
        url: 'redis://user:password@unknown.redis.localhost:6380'
      }
    }))

    nock('http://example.org').post('/post-url-encoded/query').reply(200, (uri, body) => body)

    const backupConsoleError = console.error
    console.error = (..._args) => { }
    const res = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    console.error = backupConsoleError
    assert.strictEqual(res.text, query)
  })

  it('should always hit the endpoint (no cache configured)', async () => {
    const app = express()

    let counter = 0

    nock('http://example.org')
      .post('/query')
      .times(3)
      .reply(200, (_uri, _body) => {
        return counter++
      })

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query'
    }))

    const res1 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res1.text, '0')

    const res2 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res2.text, '1')

    const res3 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res3.text, '2')
  })

  it('should hit cached response', async () => {
    const app = express()

    let counter = 0

    nock('http://example.org')
      .post('/query')
      .times(3)
      .reply(200, (_uri, _body) => {
        return counter++
      })

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query',
      cache: {
        url: 'redis://127.0.0.1:6379'
      }
    }))

    const res1 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res1.text, '0')

    const res2 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res2.text, '0')

    const res3 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res3.text, '0')
  })
})
