'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = Number.parseInt(process.env.PORT || '10000', 10);
const TOURNAMENTS_URL = 'https://hast59-classic-tournament-test.rushrevs.workers.dev/api/tournaments';
const MAX_LOGIN_BODY_BYTES = 4096;
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 7000;

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

async function readRequestBody(req, limit) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > limit) throw Object.assign(new Error('body_too_large'), { statusCode: 413 });
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('body_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readResponseLimited(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('upstream_body_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function handle(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'OPTIONS' && ['/health', '/user/login', '/api/tournaments'].includes(pathname)) {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'hast-056-private-test-api' });
  }

  if (req.method === 'POST' && pathname === '/user/login') {
    try {
      const rawBody = await readRequestBody(req, MAX_LOGIN_BODY_BYTES);
      if (rawBody.trim()) {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          return sendJson(res, 415, { success: false, error: 'content_type_must_be_json' });
        }
        JSON.parse(rawBody);
      }
    } catch (error) {
      if (error.statusCode === 413) return sendJson(res, 413, { success: false, error: 'request_body_too_large' });
      if (error instanceof SyntaxError) return sendJson(res, 400, { success: false, error: 'invalid_json' });
      return sendJson(res, 400, { success: false, error: 'invalid_request' });
    }

    const id = `guest-${randomUUID()}`;
    return sendJson(res, 200, {
      success: true,
      guest: true,
      user: {
        id,
        username: 'Hast Guest',
        gems: 0,
        coins: 0,
      },
    });
  }

  if (req.method === 'GET' && pathname === '/api/tournaments') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(TOURNAMENTS_URL, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
      const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        return sendJson(res, 502, { success: false, error: 'tournament_service_invalid_response' });
      }
      const body = await readResponseLimited(upstream, MAX_UPSTREAM_BYTES);
      JSON.parse(body.toString('utf8'));
      res.writeHead(upstream.status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': body.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end(body);
    } catch {
      if (!res.headersSent) return sendJson(res, 502, { success: false, error: 'tournament_service_unavailable' });
      return res.end();
    } finally {
      clearTimeout(timer);
    }
  }

  if (['/health', '/user/login', '/api/tournaments'].includes(pathname)) {
    res.setHeader('allow', pathname === '/user/login' ? 'POST, OPTIONS' : 'GET, OPTIONS');
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  return sendJson(res, 404, { success: false, error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) sendJson(res, 500, { success: false, error: 'internal_error' });
    else res.end();
  });
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sanitized test API listening on 0.0.0.0:${PORT}`);
});
