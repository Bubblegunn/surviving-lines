'use strict'

/* global describe, it */

var assert = require('assert')
var cors = require('..')

describe('vary header', function () {
  it('adds Vary: Origin when origin is a function', function (done) {
    var mw = cors({ origin: function (o, cb) { cb(null, true) } })
    var headers = {}
    var res = {
      getHeader: function (k) { return headers[k.toLowerCase()] },
      setHeader: function (k, v) { headers[k.toLowerCase()] = v },
      end: function () {}
    }
    mw({ method: 'GET', headers: { origin: 'http://a.test' } }, res, function () {
      assert.strictEqual(headers.vary, 'Origin')
      done()
    })
  })

  it('does not add Vary for a fixed origin', function (done) {
    var mw = cors({ origin: 'http://a.test' })
    var headers = {}
    var res = {
      getHeader: function (k) { return headers[k.toLowerCase()] },
      setHeader: function (k, v) { headers[k.toLowerCase()] = v },
      end: function () {}
    }
    mw({ method: 'GET', headers: { origin: 'http://a.test' } }, res, function () {
      assert.strictEqual(headers.vary, undefined)
      done()
    })
  })
})
