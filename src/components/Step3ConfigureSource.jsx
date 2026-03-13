import { useState, useEffect, useRef, useCallback } from 'react'

const ARN_PATTERN = /^arn:aws:iam::/

export default function Step3ConfigureSource({ auth, initialConfig, onResult, onBack }) {
  const [form, setForm] = useState({
    sourceName: 'CIEM AWS',
    description: 'CIEM source for AWS',
    ownerQuery: '',
    ownerId: '',
    ownerName: '',
    roleArn: '',
    cloudTrailArn: '',
    cloudTrailBucketAccountId: '',
    connectorScriptName: 'ciem-aws',
  })

  // Pre-fill when returning from Step 4 (error → go back)
  useEffect(() => {
    if (initialConfig) {
      setForm((prev) => ({ ...prev, ...initialConfig }))
    }
  }, [initialConfig])

  const [identities, setIdentities] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null) // { status, message, raw }
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('idle') // 'idle' | 'creating' | 'testing'

  const searchTimerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Close identity dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const searchIdentities = useCallback(
    async (query) => {
      if (query.length < 2) {
        setIdentities([])
        setShowDropdown(false)
        return
      }
      setSearchLoading(true)
      setSearchError(null)
      try {
        // Use POST /v3/search — the same endpoint the ISC UI uses.
        // GET /v3/identities only supports `eq` and `sw` on `name`,
        // so `co` (contains) returns a 404. The search API supports
        // full-text matching and returns richer identity data.
        const res = await fetch('/api/v3/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
            'X-Tenant': auth.tenant,
          },
          body: JSON.stringify({
            indices: ['identities'],
            query: { query: query },
            sort: ['name'],
            limit: 10,
          }),
        })

        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch { data = null }

        if (res.ok) {
          // Response is a plain array of IdentityDocument hits
          let list = []
          if (Array.isArray(data)) {
            list = data
          } else if (Array.isArray(data?.data)) {
            list = data.data
          } else if (Array.isArray(data?.items)) {
            list = data.items
          }
          setIdentities(list)
          setSearchError(null)
        } else {
          setIdentities([])
          setSearchError({
            status: res.status,
            message:
              data?.detailCode || data?.messages?.[0]?.text ||
              data?.message || data?.error_description ||
              `HTTP ${res.status}`,
            raw: text.slice(0, 400),
          })
        }
      } catch (err) {
        setIdentities([])
        setSearchError({ status: null, message: err.message, raw: null })
      } finally {
        setSearchLoading(false)
        // Always open the dropdown so the user always sees feedback
        setShowDropdown(true)
      }
    },
    [auth]
  )

  const handleOwnerInput = (e) => {
    const q = e.target.value
    setForm((f) => ({ ...f, ownerQuery: q, ownerId: '', ownerName: '' }))
    setFieldErrors((fe) => ({ ...fe, owner: undefined }))
    setSearchError(null)
    if (q.length < 2) setShowDropdown(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchIdentities(q), 350)
  }

  const selectIdentity = (identity) => {
    const label = identity.displayName || identity.name || identity.id
    setForm((f) => ({
      ...f,
      ownerQuery: label,
      ownerId: identity.id,
      ownerName: label,
    }))
    setFieldErrors((fe) => ({ ...fe, owner: undefined }))
    setShowDropdown(false)
    setIdentities([])
  }

  const setField = (field) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [field]: val }))
    setFieldErrors((fe) => ({ ...fe, [field]: undefined }))
  }

  const validate = () => {
    const errs = {}
    if (!form.sourceName.trim()) errs.sourceName = 'Source name is required.'
    if (!form.ownerId) errs.owner = 'Select an owner from the search dropdown.'
    if (!form.roleArn.trim()) {
      errs.roleArn = 'Role ARN is required.'
    } else if (!ARN_PATTERN.test(form.roleArn.trim())) {
      errs.roleArn = 'Must start with arn:aws:iam::'
    }
    if (!form.connectorScriptName.trim()) {
      errs.connectorScriptName = 'Connector script name is required.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)

    // Snapshot config for "go back & pre-fill" case
    const savedConfig = {
      sourceName: form.sourceName,
      description: form.description,
      ownerQuery: form.ownerQuery,
      ownerId: form.ownerId,
      ownerName: form.ownerName,
      roleArn: form.roleArn,
      cloudTrailArn: form.cloudTrailArn,
      cloudTrailBucketAccountId: form.cloudTrailBucketAccountId,
      connectorScriptName: form.connectorScriptName,
    }

    /* ── Step A: Create source ── */
    setPhase('creating')

    let sourceId
    let createResponseData

    try {
      const res = await fetch('/api/v3/sources', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'X-Tenant': auth.tenant,
        },
        body: JSON.stringify({
          name: form.sourceName,
          description: form.description,
          // ISC BaseReferenceDto requires type + id + name — omitting name
          // passes JSON schema validation but triggers a 400.1 semantic error.
          owner: { type: 'IDENTITY', id: form.ownerId, name: form.ownerName },
          connector: form.connectorScriptName.trim(),
          connectorAttributes: {
            roleArn: form.roleArn.trim(),
            // Omit optional ARN fields entirely when blank — ISC rejects
            // empty strings on ARN-typed attributes with a 400.1 error.
            ...(form.cloudTrailArn.trim()
              ? { cloudTrailArn: form.cloudTrailArn.trim() }
              : {}),
            ...(form.cloudTrailBucketAccountId.trim()
              ? { cloudTrailBucketAccountId: form.cloudTrailBucketAccountId.trim() }
              : {}),
          },
        }),
      })

      const text = await res.text()
      try {
        createResponseData = JSON.parse(text)
      } catch {
        createResponseData = { _raw: text }
      }

      if (!res.ok) {
        setLoading(false)
        setPhase('idle')
        onResult(
          {
            success: false,
            phase: 'create_source',
            sourceName: form.sourceName,
            error: `HTTP ${res.status}: ${
              createResponseData?.detailCode ||
              createResponseData?.message ||
              text.slice(0, 300)
            }`,
            rawResponse: createResponseData,
          },
          savedConfig
        )
        return
      }

      sourceId = createResponseData?.id
    } catch (err) {
      setLoading(false)
      setPhase('idle')
      onResult(
        {
          success: false,
          phase: 'create_source',
          sourceName: form.sourceName,
          error: err.message,
          rawResponse: null,
        },
        savedConfig
      )
      return
    }

    /* ── Step B: Test connection ── */
    setPhase('testing')

    try {
      const res = await fetch(
        `/api/beta/sources/${sourceId}/connector/test-connection`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
            'X-Tenant': auth.tenant,
          },
          body: '{}',
        }
      )

      const text = await res.text()
      let testResponseData
      try {
        testResponseData = JSON.parse(text)
      } catch {
        testResponseData = { _raw: text }
      }

      setLoading(false)
      setPhase('idle')

      onResult(
        {
          success: res.ok,
          phase: 'test_connection',
          sourceName: form.sourceName,
          sourceId,
          error: res.ok
            ? null
            : `HTTP ${res.status}: ${
                testResponseData?.detailCode ||
                testResponseData?.message ||
                text.slice(0, 300)
              }`,
          createResponse: createResponseData,
          rawResponse: testResponseData,
        },
        savedConfig
      )
    } catch (err) {
      setLoading(false)
      setPhase('idle')
      onResult(
        {
          success: false,
          phase: 'test_connection',
          sourceName: form.sourceName,
          sourceId,
          error: err.message,
          createResponse: createResponseData,
          rawResponse: null,
        },
        savedConfig
      )
    }
  }

  const inputCls = (field) =>
    `w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-shadow
     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
     ${fieldErrors[field] ? 'border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400' : 'border-gray-300 bg-white'}`

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-4">
        <div className="w-12 h-12 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-orange-600 font-bold text-sm tracking-tight">AWS</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">CIEM AWS Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure your source details and AWS connection settings.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="px-8 py-7 space-y-8">
          {/* ── Source Details ── */}
          <section>
            <SectionHeading>Source Details</SectionHeading>
            <div className="space-y-5">
              {/* Name */}
              <FieldWrapper label="Source Name" required error={fieldErrors.sourceName}>
                <input
                  type="text"
                  value={form.sourceName}
                  onChange={setField('sourceName')}
                  className={inputCls('sourceName')}
                  disabled={loading}
                />
              </FieldWrapper>

              {/* Description */}
              <FieldWrapper label="Description">
                <input
                  type="text"
                  value={form.description}
                  onChange={setField('description')}
                  className={inputCls('description')}
                  disabled={loading}
                />
              </FieldWrapper>

              {/* Owner search */}
              <FieldWrapper
                label="Source Owner"
                required
                error={fieldErrors.owner}
                hint="Type 2+ characters to search identities in your tenant."
              >
                {/*
                  dropdownRef wraps the input + dropdown together so the
                  outside-click handler doesn't close the dropdown when the
                  user clicks a result row.
                */}
                <div ref={dropdownRef} className="relative">
                  <input
                    type="text"
                    value={form.ownerQuery}
                    onChange={handleOwnerInput}
                    placeholder="Search by name…"
                    className={inputCls('owner') + ' pr-10'}
                    disabled={loading}
                    autoComplete="off"
                  />

                  {/* Spinner / check icon inside the input */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {searchLoading && <Spinner className="text-gray-400" />}
                    {!searchLoading && form.ownerId && (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    )}
                  </div>

                  {/*
                    Dropdown — anchored with top-full so it always sits flush
                    below the input, regardless of surrounding layout.
                    z-50 ensures it renders above all other form fields.
                  */}
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      {searchError ? (
                        /* ── API error state ── */
                        <div className="p-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-red-500 font-semibold text-xs uppercase tracking-wide">
                              Search failed
                              {searchError.status ? ` · HTTP ${searchError.status}` : ''}
                            </span>
                          </div>
                          <p className="text-sm text-red-700 mb-2">{searchError.message}</p>
                          {searchError.raw && (
                            <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-2 overflow-auto max-h-28 font-mono whitespace-pre-wrap">
                              {searchError.raw}
                            </pre>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            Common causes: token lacks <code className="bg-gray-100 px-1 rounded">idn:identities:read</code> scope, or the proxy is not running.
                          </p>
                        </div>
                      ) : identities.length > 0 ? (
                        /* ── Results list ── */
                        identities.map((identity) => {
                          const displayName = identity.displayName || identity.name || identity.id
                          // email may be a string or first element of emails[]
                          const email =
                            identity.email ||
                            (Array.isArray(identity.emails) ? identity.emails[0] : null)
                          // alias may be the `alias` field or first element of aliases[]
                          const alias =
                            identity.alias ||
                            (Array.isArray(identity.aliases) ? identity.aliases[0] : null)
                          const subtitle = [email, alias].filter(Boolean).join(' · ')

                          return (
                            <button
                              key={identity.id}
                              type="button"
                              onMouseDown={(e) => {
                                // Prevent the document mousedown handler from
                                // closing the dropdown before onClick fires.
                                e.preventDefault()
                                selectIdentity(identity)
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-blue-700">
                                  {displayName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {displayName}
                                </div>
                                {subtitle && (
                                  <div className="text-xs text-gray-400 truncate mt-0.5">
                                    {subtitle}
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        /* ── No results ── */
                        <div className="px-4 py-6 text-sm text-gray-400 text-center">
                          No identities found for &ldquo;{form.ownerQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected identity confirmation pill */}
                {form.ownerId && (
                  <p className="mt-1.5 text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    {form.ownerName}
                    <span className="text-gray-400 font-normal">({form.ownerId})</span>
                  </p>
                )}
              </FieldWrapper>
            </div>
          </section>

          <Divider />

          {/* ── Connection Settings ── */}
          <section>
            <SectionHeading>Connection Settings</SectionHeading>
            <div className="space-y-5">
              {/* Role ARN */}
              <FieldWrapper
                label="Role ARN"
                required
                error={fieldErrors.roleArn}
                hint="The IAM role ARN that SailPoint will assume in your AWS account."
              >
                <input
                  type="text"
                  value={form.roleArn}
                  onChange={setField('roleArn')}
                  placeholder="arn:aws:iam::ACCOUNT_ID:role/SailPointCAMAuditRole"
                  className={inputCls('roleArn') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* CloudTrail ARN */}
              <FieldWrapper
                label="CloudTrail ARN"
                badge="Optional"
                hint="Leave blank if you are not using CloudTrail integration."
              >
                <input
                  type="text"
                  value={form.cloudTrailArn}
                  onChange={setField('cloudTrailArn')}
                  placeholder="arn:aws:cloudtrail:us-east-1:ACCOUNT_ID:trail/my-trail"
                  className={inputCls('cloudTrailArn') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* CloudTrail Bucket Account ID */}
              <FieldWrapper
                label="CloudTrail Bucket Account ID"
                badge="Optional"
                hint="The AWS account ID that owns the S3 bucket storing CloudTrail logs. Leave blank if same account."
              >
                <input
                  type="text"
                  value={form.cloudTrailBucketAccountId}
                  onChange={setField('cloudTrailBucketAccountId')}
                  placeholder="123456789012"
                  className={inputCls('cloudTrailBucketAccountId') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* Connector Script Name */}
              <FieldWrapper
                label="Connector Script Name"
                required
                error={fieldErrors.connectorScriptName}
                hint={
                  <>
                    The internal connector identifier registered in your ISC tenant.
                    Pre-filled with <code className="bg-gray-100 px-1 rounded font-mono">ciem-aws</code>.
                    Change this only if your tenant uses a different script name, or if you see
                    a <em>"connector not found"</em> error — which means the CIEM module may not
                    be enabled for your tenant.
                  </>
                }
              >
                <input
                  type="text"
                  value={form.connectorScriptName}
                  onChange={setField('connectorScriptName')}
                  placeholder="ciem-aws"
                  className={inputCls('connectorScriptName') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* External ID (read-only) */}
              <FieldWrapper
                label="External ID"
                hint="Managed automatically by SailPoint — do not set manually."
              >
                <input
                  type="text"
                  readOnly
                  value="Auto-generated by SailPoint — leave blank"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              </FieldWrapper>
            </div>
          </section>
        </div>

        {/* Progress banner */}
        {loading && (
          <div className="mx-8 mb-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Spinner className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  {phase === 'creating' ? 'Creating source…' : 'Testing connection…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {phase === 'creating'
                    ? 'Registering your CIEM AWS source with SailPoint ISC.'
                    : 'Verifying connectivity between SailPoint and your AWS environment.'}
                </p>
                {phase === 'testing' && (
                  <p className="text-xs text-blue-500 mt-1 font-mono">Step 2/2</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-8 pb-8 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner />
                {phase === 'creating' ? 'Creating Source…' : 'Testing Connection…'}
              </>
            ) : (
              <>
                Save &amp; Test Connection
                <BoltIcon className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Layout helpers ── */

function SectionHeading({ children }) {
  return (
    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5 flex items-center gap-2">
      <span className="flex-1 h-px bg-gray-100" />
      {children}
      <span className="flex-1 h-px bg-gray-100" />
    </h3>
  )
}

function Divider() {
  return <div className="border-t border-gray-100" />
}

function FieldWrapper({ label, required, badge, hint, error, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {required && <span className="text-red-500 text-sm leading-none">*</span>}
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
            {badge}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          <ExclamationIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}

/* ── Icons ── */

function Spinner({ className }) {
  return (
    <svg className={`animate-spin w-4 h-4 ${className || ''}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ExclamationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function BoltIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}
