// Vercel Serverless Function — proxies requests to Respond.io API
// The RESPONDIO_API_TOKEN env var is set in Vercel project settings (never client-side).
// Validates the caller is authenticated via Supabase JWT before forwarding.

const SUPABASE_URL = 'https://mzrklddpdliltwrrackj.supabase.co';
const RIO_BASE = 'https://api.respond.io';

const ALLOWED_PREFIXES = ['v1/contact', 'v2/contact', 'v1/message', 'v2/message'];

module.exports = async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  const allowed = ['https://becurious-scheduler.vercel.app', 'http://localhost:3000'];
  const acao = allowed.includes(origin) ? origin : allowed[0];
  res.setHeader('Access-Control-Allow-Origin', acao);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Authenticate — verify Supabase JWT
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const jwt = auth.replace('Bearer ', '');

  try {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'Authorization': 'Bearer ' + jwt,
        'apikey': process.env.SUPABASE_ANON_KEY || '',
      },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Auth check failed' });
  }

  // Parse body
  const { endpoint, method, body } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  // Allowlist check
  const clean = endpoint.replace(/^\/+/, '');
  const isAllowed = ALLOWED_PREFIXES.some(p => clean.startsWith(p));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Endpoint not allowed: ' + clean });
  }

  // Forward to Respond.io
  const rioToken = process.env.RESPONDIO_API_TOKEN;
  if (!rioToken) {
    return res.status(500).json({ error: 'API token not configured' });
  }

  const upstreamUrl = RIO_BASE + '/' + clean;
  const httpMethod = (method || 'POST').toUpperCase();

  const fetchOpts = {
    method: httpMethod,
    headers: {
      'Authorization': 'Bearer ' + rioToken,
      'Content-Type': 'application/json',
    },
  };

  if (!['GET', 'HEAD'].includes(httpMethod) && body !== undefined) {
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(upstreamUrl, fetchOpts);
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Failed to reach Respond.io' });
  }
};
