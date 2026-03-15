import { useState } from 'react'

export default function Step1Login({ onLogin }) {
  const [form, setForm] = useState({ tenant: '', domain: '.api.identitynow.com', clientId: '', clientSecret: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showSecret, setShowSecret] = useState(false)

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value.trim() }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Tenant': `${form.tenant}${form.domain}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: form.clientId,
          client_secret: form.clientSecret,
        }),
      })

      let data
      const text = await res.text()
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`)
      }

      if (!res.ok) {
        const msg =
          data?.error_description ||
          data?.error ||
          data?.message ||
          `HTTP ${res.status}`
        throw new Error(msg)
      }

      if (!data.access_token) {
        throw new Error('Response did not include an access_token.')
      }

      onLogin({ tenant: `${form.tenant}${form.domain}`, token: data.access_token })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <ShieldIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Connect to SailPoint ISC</h2>
            <p className="text-sm text-blue-100 mt-0.5">
              Authenticate with your tenant credentials
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-7">
        {/* CORS notice */}
        <div className="mb-6 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <InfoIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-amber-800">
            <span className="font-semibold">CORS notice:</span> Browser-direct ISC API calls are
            blocked by CORS. Run the included proxy with{' '}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">npm start</code>{' '}
            before using this app. See <span className="font-medium">README.md</span> for details.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tenant field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tenant Name <span className="text-red-500">*</span>
            </label>
            <div
              className={`flex rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow ${
                error ? 'border-gray-300' : 'border-gray-300'
              }`}
            >
              <span className="bg-gray-50 border-r border-gray-200 px-3 py-2.5 text-sm text-gray-400 whitespace-nowrap select-none">
                https://
              </span>
              <input
                type="text"
                required
                autoFocus
                placeholder="mycompany"
                value={form.tenant}
                onChange={handleChange('tenant')}
                className="flex-1 px-3 py-2.5 text-sm outline-none bg-white min-w-0"
              />
              <select
                value={form.domain}
                onChange={handleChange('domain')}
                className="bg-gray-50 border-l border-gray-200 px-3 py-2.5 text-sm text-gray-600 outline-none cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
              >
                <option value=".api.identitynow.com">.api.identitynow.com</option>
                <option value=".api.identitynow-demo.com">.api.identitynow-demo.com</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Your ISC tenant subdomain and environment
            </p>
          </div>

          {/* Client ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.clientId}
              onChange={handleChange('clientId')}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow font-mono"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client Secret <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                required
                placeholder="••••••••••••••••••••"
                value={form.clientSecret}
                onChange={handleChange('clientSecret')}
                className="w-full px-3.5 py-2.5 pr-11 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showSecret ? 'Hide secret' : 'Show secret'}
              >
                {showSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Authentication failed</p>
                <p className="text-sm text-red-700 mt-0.5 break-all">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.tenant || !form.clientId || !form.clientSecret}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Spinner />
                Authenticating…
              </>
            ) : (
              <>
                Connect
                <ArrowRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ── Icons ── */
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function InfoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  )
}

function XCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function EyeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EyeOffIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function ArrowRightIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
