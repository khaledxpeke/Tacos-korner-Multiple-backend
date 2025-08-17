/**
 * Simple response helpers to keep consistent envelopes and translated messages.
 * Usage:
 *   const { ok, created, fail } = require('../utils/respond');
 *   return ok(req, res, 'common.ok', { foo: 'bar' });
 */

function ok(req, res, key = 'common.ok', data = {}) {
  return res.json({ success: true, message: req.t(key), data });
}

function created(req, res, key = 'common.created', data = {}) {
  return res.status(201).json({ success: true, message: req.t(key), data });
}

function fail(req, res, status = 400, key = 'errors.unknown', extra = {}) {
  return res.status(status).json({ success: false, message: req.t(key), ...extra });
}

module.exports = { ok, created, fail };
