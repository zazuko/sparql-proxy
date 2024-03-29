/* global describe, it */

const assert = require('assert')
const express = require('express')
const { afterEach } = require('mocha')
const nock = require('nock')
const request = require('supertest')
const sparqlProxy = require('..')

describe('redis cache for sparql-proxy', () => {
  const query = 'SELECT * WHERE {?s ?p ?o.} LIMIT 10'

  afterEach(() => {
    // make sure that all nock interceptors were used or make the test fail
    if (!nock.isDone()) {
      nock.cleanAll()
      throw new Error('Not all nock interceptors were used!')
    }
  })

  it('should start without crash (reset cache + simple request)', async () => {
    const app = express()

    let counter = 0

    nock('http://example.org')
      .post('/query')
      .reply(200, (_uri, _body) => {
        return counter++
      })

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query',
      cache: {
        url: 'redis://127.0.0.1:6379',
        clearAtStartup: true
      }
    }))

    const res = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res.text, '0')
  })

  it('should not crash even if redis is not recheable', async () => {
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
        url: 'redis://user:password@unknown.redis.localhost:6380'
      }
    }))

    const backupConsoleError = console.error
    console.error = (..._args) => { }

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

    console.error = backupConsoleError
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
      .reply(200, (_uri, _body) => {
        return counter++
      })

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query',
      cache: {
        url: 'redis://127.0.0.1:6379',
        clearAtStartup: true
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

  it('should not hit cached response (cache disabled)', async () => {
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
        url: 'redis://127.0.0.1:6379',
        clearAtStartup: true,
        disabled: true
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
    assert.strictEqual(res2.text, '1')

    const res3 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res3.text, '2')
  })

  it('should be able to configure a TTL', async () => {
    const app = express()

    let counter = 0

    nock('http://example.org')
      .post('/query')
      .times(2)
      .reply(200, (_uri, _body) => {
        return counter++
      })

    // we make sure that the cache get cleared at startup
    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query',
      cache: {
        url: 'redis://127.0.0.1:6379',
        clearAtStartup: true,
        ttl: 1
      }
    }))

    // first request: create the cache entry
    const res1 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res1.text, '0')

    // second request: we expect to get the result from the cache
    const res2 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res2.text, '0')

    // wait a bit more than the TTL, so that the cache entry gets deleted
    await new Promise(resolve => setTimeout(resolve, 1200))

    // third request: we should get a fresh result from the endpoint
    const res3 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res3.text, '1')

    // fourth request: we should get the cached answer
    const res4 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res4.text, '1')
  })

  it('should cache big response', async () => {
    const app = express()

    const bigResponse = 'somethingLong'.repeat(5000)

    nock('http://example.org')
      .post('/query')
      .reply(200, (_uri, _body) => {
        return bigResponse
      })

    app.use('/query', sparqlProxy({
      endpointUrl: 'http://example.org/query',
      cache: {
        url: 'redis://127.0.0.1:6379',
        clearAtStartup: true
      }
    }))

    const res1 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res1.text, bigResponse)

    const res2 = await request(app)
      .post('/query')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('query=' + encodeURIComponent(query))
      .expect(200)
    assert.strictEqual(res2.text, bigResponse)
  })
})
