/* global describe, it */

const assert = require('assert')
const express = require('express')
const nock = require('nock')
const request = require('supertest')
const sparqlProxy = require('..')

describe('redis cache for sparql-proxy', () => {
  const query = 'SELECT * WHERE {?s ?p ?o.} LIMIT 10'

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
})