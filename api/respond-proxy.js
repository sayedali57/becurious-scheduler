// Vercel Serverless Function — proxies requests to Respond.io API
// The RESPONDIO_API_TOKEN env var is set in Vercel project settings (never client-side).
// Uses built-in https module for Node.js compatibility (no fetch dependency).

var https = require('https');

var SUPABASE_URL = 'https://mzrklddpdliltwrrackj.supabase.co';
var RIO_BASE = 'https://api.respond.io';
var ALLOWED_PREFIXES = ['v1/contact', 'v2/contact', 'v1/message', 'v2/message'];

function httpsRequest(url, options, postData) {
  return new Promise(function(resolve, reject) {
    var req = https.request(url, options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  try {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // Authenticate — verify Supabase JWT
    var auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' });
    }
    var jwt = auth.replace('Bearer ', '');
    var anonKey = process.env.SUPABASE_ANON_KEY || '';

    var authResult = await httpsRequest(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + jwt, 'apikey': anonKey },
    });
    if (authResult.status !== 200) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Parse body
    var payload = req.body || {};
    var endpoint = payload.endpoint;
    var method = payload.method || 'POST';
    var body = payload.body;

    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    // Allowlist check
    var clean = endpoint.replace(/^\/+/, '');
    var isAllowed = ALLOWED_PREFIXES.some(function(p) { return clean.startsWith(p); });
    if (!isAllowed) {
      return res.status(403).json({ error: 'Endpoint not allowed: ' + clean });
    }

    // Forward to Respond.io
    var rioToken = process.env.RESPONDIO_API_TOKEN;
    if (!rioToken) {
      return res.status(500).json({ error: 'API token not configured' });
    }

    var upstreamUrl = RIO_BASE + '/' + clean;
    var httpMethod = method.toUpperCase();
    var postData = (!['GET', 'HEAD'].includes(httpMethod) && body !== undefined)
      ? JSON.stringify(body) : null;

    var upstream = await httpsRequest(upstreamUrl, {
      method: httpMethod,
      headers: {
        'Authorization': 'Bearer ' + rioToken,
        'Content-Type': 'application/json',
      },
    }, postData);

    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(upstream.body);

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
};
