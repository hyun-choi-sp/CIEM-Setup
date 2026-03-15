/**
 * server.js — Local CORS proxy for the SailPoint ISC CIEM Configurator
 *
 * All requests from the Vite dev server arrive as:
 *   /api/<path>
 * and are forwarded to:
 *   https://<tenant>.api.identitynow.com/<path>
 *
 * The tenant is read from the X-Tenant request header, which the React
 * app sets on every fetch() call.
 *
 * Requires Node 18+ (for built-in fetch).
 * Start with: node server.js   OR   npm run server
 */

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: '*', // dev-only; tighten in production
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
}))

// Parse URL-encoded bodies (OAuth token requests)
app.use(express.urlencoded({ extended: true }))

// Parse JSON bodies — includes application/json-patch+json for PATCH requests
app.use(express.json({ type: ['application/json', 'application/json-patch+json'] }))

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SailPoint ISC CIEM Configurator Proxy',
    version: '1.0.0',
    usage: 'Vite dev server proxies /api/* → this server → https://{tenant}.api.identitynow.com/*',
  })
})

// ── Main proxy handler ────────────────────────────────────────────────────────

app.all('/api/*', async (req, res) => {
  const tenant = req.headers['x-tenant']

  // Allow dots in the tenant string since it now includes the full domain
  if (!tenant || !/^[a-zA-Z0-9-.]+$/.test(tenant)) {
    return res.status(400).json({
      error: 'missing_or_invalid_tenant',
      message:
        'The X-Tenant request header is required and must be a valid domain (e.g. "mycompany.api.identitynow.com").',
    })
  }

  // Strip the /api prefix to get the ISC path
  const iscPath = req.path.replace(/^\/api/, '') || '/'

  // Rebuild query string, excluding any internal params we added
  const queryParams = { ...req.query }
  const queryString =
    Object.keys(queryParams).length > 0
      ? '?' + new URLSearchParams(queryParams).toString()
      : ''

  // The tenant variable now contains the full domain
  const targetUrl = `https://${tenant}${iscPath}${queryString}`

  // Forward all original headers, minus hop-by-hop and our custom ones
  const DROP_REQUEST_HEADERS = new Set([
    'host',
    'x-tenant',
    'content-length',   // fetch recalculates this
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'upgrade',
    'proxy-authorization',
    'proxy-connection',
  ])

  const forwardHeaders = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders[key] = value
    }
  }

  // Build fetch options
  const fetchOptions = {
    method: req.method,
    headers: forwardHeaders,
  }

  // Attach body for mutating methods
  if (!['GET', 'HEAD'].includes(req.method)) {
    const ct = (req.headers['content-type'] || '').toLowerCase()
    if (ct.includes('application/x-www-form-urlencoded')) {
      // Re-encode the parsed body back to form format
      const bodyStr = new URLSearchParams(req.body).toString()
      if (bodyStr) {
        fetchOptions.body = bodyStr
      }
    } else if (ct.includes('application/json') || ct.includes('application/json-patch+json')) {
      // Attach body if present — check works for both objects and arrays
      // Covers: application/json, application/json-patch+json, application/merge-patch+json
      const hasBody = req.body != null && (
        Array.isArray(req.body) ? req.body.length > 0 : Object.keys(req.body).length > 0
      )
      if (hasBody) {
        fetchOptions.body = JSON.stringify(req.body)
      }
    } else if (ct.includes('multipart/form-data')) {
      // Buffer the raw multipart body and forward it unchanged.
      // express does not parse multipart so the stream is untouched.
      // The Content-Type header (with boundary) is already in forwardHeaders.
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const rawBody = Buffer.concat(chunks)
      if (rawBody.length > 0) {
        fetchOptions.body = rawBody
      }
    }
  }

  // ── Logging ────────────────────────────────────────────────────────────────
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${ts}] ${req.method.padEnd(6)} ${targetUrl}`)

  // ── Forward the request ────────────────────────────────────────────────────
  let upstreamRes
  try {
    upstreamRes = await fetch(targetUrl, fetchOptions)
  } catch (err) {
    console.error(`[Proxy] Network error forwarding to ${targetUrl}:`, err.message)
    return res.status(502).json({
      error: 'proxy_network_error',
      message: err.message,
      target: targetUrl,
    })
  }

  // ── Forward response status ────────────────────────────────────────────────
  res.status(upstreamRes.status)

  // ── Forward response headers (skip hop-by-hop) ────────────────────────────
  const DROP_RESPONSE_HEADERS = new Set([
    'transfer-encoding',
    'connection',
    'keep-alive',
    'content-encoding', // express will re-compress if needed
  ])

  upstreamRes.headers.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value)
    }
  })

  // Always allow cross-origin access from the Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*')

  // ── Stream body back ───────────────────────────────────────────────────────
  const body = await upstreamRes.text()
  console.log(
    `[${ts}]       ← ${upstreamRes.status} (${Buffer.byteLength(body, 'utf8')} bytes)`
  )
  res.send(body)
})

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('')
  console.log('  SailPoint ISC CIEM Configurator — Proxy Server')
  console.log('  ─────────────────────────────────────────────')
  console.log(`  Listening on  http://localhost:${PORT}`)
  console.log(`  Forwarding    /api/* → https://{tenant}/*`)
  console.log(`  Tenant header X-Tenant: <your-tenant-domain>`)
  console.log('')
  console.log('  Keep this running while you use the Vite dev server.')
  console.log('  Use Ctrl+C to stop.')
  console.log('')
})
