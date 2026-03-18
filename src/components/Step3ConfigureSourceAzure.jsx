import { useState, useEffect, useRef, useCallback } from 'react'

const PREFILL_CREDS = {
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
  clientSecret: import.meta.env.VITE_AZURE_CLIENT_SECRET || '',
  tenantId: import.meta.env.VITE_AZURE_TENANT_ID || '',
}

export default function Step3ConfigureSourceAzure({ auth, initialConfig, onResult, onBack }) {
  const [form, setForm] = useState({
    sourceName: 'CIEM Azure',
    description: 'CIEM source for Azure',
    ownerQuery: '',
    ownerId: '',
    ownerName: '',
    connectorScriptName: 'ciem-azure-connector-script',
    clientId: '00000000-0000-0000-0000-000000000000',
    tenantId: '11111111-1111-1111-1111-111111111111',
    clientSecret: 'azure-client-secret-example',
    instanceIds: '',
    tenantType: 'Global',
  })

  const [prefillActive, setPrefillActive] = useState(false)
  const [showSecrets, setShowSecrets] = useState({})

  // Pre-fill when returning from Step 4 (error → go back)
  useEffect(() => {
    if (initialConfig) {
      setForm((prev) => ({ ...prev, ...initialConfig }))
    }
  }, [initialConfig])

  // Auto-fill owner with SailPoint Services from this tenant
  useEffect(() => {
    if (initialConfig?.ownerId) return
    const autoFill = async () => {
      try {
        const res = await fetch('/api/v3/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
            'X-Tenant': auth.tenant,
          },
          body: JSON.stringify({
            indices: ['identities'],
            query: { query: 'SailPoint Services' },
            sort: ['name'],
            limit: 5,
          }),
        })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data?.data ?? data?.items ?? [])
        const match = list.find(
          (i) => (i.displayName || i.name || '').toLowerCase() === 'sailpoint services'
        )
        if (match) {
          const label = match.displayName || match.name || match.id
          setForm((f) => ({ ...f, ownerQuery: label, ownerId: match.id, ownerName: label }))
        }
      } catch { /* silent fail */ }
    }
    autoFill()
  }, [auth]) // eslint-disable-line react-hooks/exhaustive-deps

  const [identities, setIdentities] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('idle') // 'idle' | 'creating' | 'patching' | 'testing'
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectMatches, setDetectMatches] = useState(null) // null | [] | [{scriptName, name}]
  const [detectError, setDetectError] = useState(null)

  // Debug: inspect an existing source to discover correct connectorAttribute key names
  const [debugSourceId, setDebugSourceId] = useState('')
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugResult, setDebugResult] = useState(null) // { connectorAttributes, connectionType, connector } | { error }
  const [debugOpen, setDebugOpen] = useState(false)
  const [sourceListLoading, setSourceListLoading] = useState(false)
  const [sourceList, setSourceList] = useState(null) // null | [] | [{id, name, connector, connectionType}]
  const [sourceListError, setSourceListError] = useState(null)

  const searchTimerRef = useRef(null)
  const dropdownRef = useRef(null)

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
    if (prefillActive) setPrefillActive(false)
  }

  const applyPrefill = () => {
    if (prefillActive) {
      setForm((f) => ({
        ...f,
        clientId: '00000000-0000-0000-0000-000000000000',
        clientSecret: 'azure-client-secret-example',
        tenantId: '11111111-1111-1111-1111-111111111111'
      }))
      setPrefillActive(false)
    } else {
      setForm((f) => ({ ...f, ...PREFILL_CREDS }))
      setFieldErrors((fe) => ({ ...fe, clientId: undefined, clientSecret: undefined, tenantId: undefined }))
      setPrefillActive(true)
    }
  }

  const detectConnectors = async () => {
    setDetectLoading(true)
    setDetectMatches(null)
    setDetectError(null)
    try {
      const res = await fetch('/api/v3/connectors?limit=250', {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant': auth.tenant,
        },
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = null }

      if (!res.ok) {
        setDetectError(`HTTP ${res.status}: ${data?.message || text.slice(0, 200)}`)
        return
      }

      const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
      const keywords = ['azure', 'ciem', 'cam', 'entra', 'msentraid']
      const matches = list.filter((c) => {
        const haystack = `${c.scriptName || ''} ${c.name || ''} ${c.type || ''}`.toLowerCase()
        return keywords.some((k) => haystack.includes(k))
      })
      setDetectMatches(matches)
      if (matches.length === 1) {
        setForm((f) => ({ ...f, connectorScriptName: matches[0].scriptName }))
        setFieldErrors((fe) => ({ ...fe, connectorScriptName: undefined }))
      }
    } catch (err) {
      setDetectError(err.message)
    } finally {
      setDetectLoading(false)
    }
  }

  const inspectSource = async () => {
    if (!debugSourceId.trim()) {
      setDebugResult({ error: 'Source ID를 입력하거나 위의 목록에서 Inspect 버튼을 클릭하세요.' })
      return
    }
    setDebugLoading(true)
    setDebugResult(null)
    try {
      const url = `/api/v3/sources/${debugSourceId.trim()}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'X-Tenant': auth.tenant,
        },
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = null }

      if (!res.ok) {
        setDebugResult({
          error: `HTTP ${res.status} — ${data?.message || data?.detailCode || text.slice(0, 300)}`,
          raw: text.slice(0, 1000),
        })
      } else if (!data) {
        setDebugResult({ error: 'Response was not valid JSON.', raw: text.slice(0, 500) })
      } else {
        setDebugResult({
          connectorAttributes: data.connectorAttributes ?? {},
          connectionType: data.connectionType,
          connector: data.connector,
          cluster: data.cluster,
          raw: text,
        })
      }
    } catch (err) {
      setDebugResult({ error: `Network error: ${err.message}`, raw: null })
    } finally {
      setDebugLoading(false)
    }
  }

  const listAzureSources = async () => {
    setSourceListLoading(true)
    setSourceList(null)
    setSourceListError(null)
    try {
      // Fetch up to 250 sources and filter for azure/ciem locally
      const res = await fetch('/api/v3/sources?limit=250&sorters=name', {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant': auth.tenant,
        },
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = null }
      if (!res.ok) {
        setSourceListError(`HTTP ${res.status}: ${data?.message || text.slice(0, 200)}`)
        return
      }
      const all = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
      const keywords = ['azure', 'ciem', 'cam', 'entra']
      const filtered = all.filter((s) => {
        const hay = `${s.name || ''} ${s.connector || ''} ${s.description || ''}`.toLowerCase()
        return keywords.some((k) => hay.includes(k))
      })
      setSourceList(
        filtered.map((s) => ({
          id: s.id,
          name: s.name,
          connector: s.connector,
          connectionType: s.connectionType,
          cluster: s.cluster ?? null,
        }))
      )
    } catch (err) {
      setSourceListError(err.message)
    } finally {
      setSourceListLoading(false)
    }
  }

  const validate = () => {
    const errs = {}
    if (!form.sourceName.trim()) errs.sourceName = 'Source name is required.'
    if (!form.ownerId) errs.owner = 'Select an owner from the search dropdown.'
    if (!form.connectorScriptName.trim()) errs.connectorScriptName = 'Connector script name is required.'
    if (!form.clientId.trim()) errs.clientId = 'Client ID is required.'
    if (!form.tenantId.trim()) errs.tenantId = 'Tenant ID is required.'
    if (!form.clientSecret.trim()) errs.clientSecret = 'Client Secret is required.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)

    const savedConfig = {
      sourceName: form.sourceName,
      description: form.description,
      ownerQuery: form.ownerQuery,
      ownerId: form.ownerId,
      ownerName: form.ownerName,
      connectorScriptName: form.connectorScriptName,
      clientId: form.clientId,
      tenantId: form.tenantId,
      clientSecret: form.clientSecret,
      instanceIds: form.instanceIds,
      tenantType: form.tenantType,
    }

    /* ── Step A: Create source (without clientSecret — ISC can't encrypt it before the source exists) ── */
    setPhase('creating')

    let sourceId
    let createResponseData

    try {
      const res = await fetch('/api/v3/sources?provisionAsCsv=false', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'X-Tenant': auth.tenant,
        },
        body: JSON.stringify({
          name: form.sourceName,
          description: form.description,
          owner: { type: 'IDENTITY', id: form.ownerId, name: form.ownerName },
          connector: form.connectorScriptName.trim(),
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

    /* ── Step B: Patch connection settings (including client secret) ── */
    setPhase('patching')

    try {
      const patchOps = [
        { op: 'add', path: '/connectorAttributes/applicationId', value: form.clientId.trim() },
        { op: 'add', path: '/connectorAttributes/tenantID', value: form.tenantId.trim() },
        { op: 'add', path: '/connectorAttributes/tenantType', value: form.tenantType },
        { op: 'add', path: '/connectorAttributes/applicationSecret', value: form.clientSecret.trim() },
        { op: 'add', path: '/connectorAttributes/applicationInstanceId', value: form.instanceIds.trim() || null },
      ]

      const patchRes = await fetch(`/api/beta/sources/${sourceId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json-patch+json',
          'X-Tenant': auth.tenant,
        },
        body: JSON.stringify(patchOps),
      })

      if (!patchRes.ok) {
        const text = await patchRes.text()
        let patchData
        try { patchData = JSON.parse(text) } catch { patchData = { _raw: text } }
        setLoading(false)
        setPhase('idle')
        onResult(
          {
            success: false,
            phase: 'patch_secret',
            sourceName: form.sourceName,
            sourceId,
            error: `HTTP ${patchRes.status}: ${
              patchData?.detailCode || patchData?.message || text.slice(0, 300)
            }`,
            createResponse: createResponseData,
            rawResponse: patchData,
          },
          savedConfig
        )
        return
      }
    } catch (err) {
      setLoading(false)
      setPhase('idle')
      onResult(
        {
          success: false,
          phase: 'patch_secret',
          sourceName: form.sourceName,
          sourceId,
          error: err.message,
          createResponse: createResponseData,
          rawResponse: null,
        },
        savedConfig
      )
      return
    }

    /* ── Step B2: Mark source as connected ── */
    try {
      await fetch(`/api/beta/sources/${sourceId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json-patch+json',
          'X-Tenant': auth.tenant,
        },
        body: JSON.stringify([
          { op: 'add', path: '/connectorAttributes/sourceConnected', value: true },
        ]),
      })
    } catch {
      // Non-fatal: proceed to test even if this fails
    }

    /* ── Step C: Test connection ── */
    setPhase('testing')

    try {
      const res = await fetch(
        `/api/beta/sources/${sourceId}/connector/test-configuration`,
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

      const testSuccess = res.ok && testResponseData?.status !== 'FAILURE'

      onResult(
        {
          success: testSuccess,
          phase: 'test_connection',
          sourceName: form.sourceName,
          sourceId,
          error: testSuccess
            ? null
            : testResponseData?.status === 'FAILURE'
            ? testResponseData?.details?.error ||
              `Connection test failed: ${JSON.stringify(testResponseData?.details ?? {})}`
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
        <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-blue-600 font-bold text-sm tracking-tight">AZ</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">CIEM Azure Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure your source details and Azure connection settings.
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

                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {searchLoading && <Spinner className="text-gray-400" />}
                    {!searchLoading && form.ownerId && (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    )}
                  </div>

                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      {searchError ? (
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
                        identities.map((identity) => {
                          const displayName = identity.displayName || identity.name || identity.id
                          const email =
                            identity.email ||
                            (Array.isArray(identity.emails) ? identity.emails[0] : null)
                          const alias =
                            identity.alias ||
                            (Array.isArray(identity.aliases) ? identity.aliases[0] : null)
                          const subtitle = [email, alias].filter(Boolean).join(' · ')

                          return (
                            <button
                              key={identity.id}
                              type="button"
                              onMouseDown={(e) => {
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
                        <div className="px-4 py-6 text-sm text-gray-400 text-center">
                          No identities found for &ldquo;{form.ownerQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
            {/* Prefill banner */}
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl mb-5 border ${prefillActive ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <span className="text-xs flex items-center gap-1.5">
                <KeyIcon className={`w-3.5 h-3.5 ${prefillActive ? 'text-amber-500' : 'text-gray-400'}`} />
                <span className={prefillActive ? 'text-amber-800 font-medium' : 'text-gray-500'}>
                  {prefillActive ? 'Test credentials applied' : 'Use test credentials for this environment'}
                </span>
              </span>
              <button type="button" onClick={applyPrefill} disabled={loading}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${prefillActive ? 'bg-amber-200 text-amber-900 hover:bg-amber-300' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                {prefillActive ? 'Clear' : 'Apply'}
              </button>
            </div>
            <div className="space-y-5">
              {/* Connector Script Name */}
              <FieldWrapper
                label="Connector Script Name"
                required
                error={fieldErrors.connectorScriptName}
                hint="The ISC connector type registered in your tenant. Use Detect to find it automatically."
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.connectorScriptName}
                    onChange={setField('connectorScriptName')}
                    placeholder="e.g. ciem-azure"
                    className={inputCls('connectorScriptName') + ' font-mono flex-1'}
                    disabled={loading}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={detectConnectors}
                    disabled={loading || detectLoading}
                    className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {detectLoading ? <Spinner className="text-blue-600" /> : null}
                    {detectLoading ? 'Detecting…' : 'Detect'}
                  </button>
                </div>

                {/* Detect results */}
                {detectError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <ExclamationIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    {detectError}
                  </p>
                )}
                {detectMatches !== null && !detectError && (
                  <div className="mt-2">
                    {detectMatches.length === 0 ? (
                      <p className="text-xs text-amber-600">No Azure/CIEM connectors found in tenant. Enter the script name manually.</p>
                    ) : detectMatches.length === 1 ? (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        Auto-filled: <code className="font-mono">{detectMatches[0].scriptName}</code>
                        {detectMatches[0].name && ` (${detectMatches[0].name})`}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">Multiple matches — select one:</p>
                        {detectMatches.map((c) => (
                          <button
                            key={c.scriptName}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, connectorScriptName: c.scriptName }))
                              setFieldErrors((fe) => ({ ...fe, connectorScriptName: undefined }))
                              setDetectMatches(null)
                            }}
                            className="block w-full text-left px-3 py-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          >
                            {c.scriptName}
                            {c.name && <span className="ml-2 font-sans text-gray-400">{c.name}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </FieldWrapper>

              {/* Client ID */}
              <FieldWrapper
                label="Client ID"
                required
                error={fieldErrors.clientId}
                hint="The Application (Client) ID of your Azure app registration."
              >
                <input
                  type="text"
                  value={form.clientId}
                  onChange={setField('clientId')}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls('clientId') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* Tenant ID */}
              <FieldWrapper
                label="Tenant ID"
                required
                error={fieldErrors.tenantId}
                hint="The Directory (Tenant) ID of your Azure Active Directory."
              >
                <input
                  type="text"
                  value={form.tenantId}
                  onChange={setField('tenantId')}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls('tenantId') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* Client Secret */}
              <FieldWrapper
                label="Client Secret"
                required
                error={fieldErrors.clientSecret}
                hint="The client secret value for your Azure app registration."
              >
                <div className="relative">
                  <input
                    type={showSecrets.clientSecret ? 'text' : 'password'}
                    value={form.clientSecret}
                    onChange={setField('clientSecret')}
                    placeholder="••••••••••••••••••••"
                    className={inputCls('clientSecret') + ' pr-10'}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowSecrets((s) => ({ ...s, clientSecret: !s.clientSecret }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showSecrets.clientSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </FieldWrapper>

              {/* Instance IDs */}
              <FieldWrapper
                label="Instance IDs"
                badge="Optional"
                hint="Leave blank unless targeting specific Azure instances."
              >
                <input
                  type="text"
                  value={form.instanceIds}
                  onChange={setField('instanceIds')}
                  placeholder=""
                  className={inputCls('instanceIds') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              {/* Tenant Type (read-only) */}
              <FieldWrapper
                label="Tenant Type"
                hint="Set to Global (Default) for standard Azure commercial tenants."
              >
                <input
                  type="text"
                  readOnly
                  value="Global (Default)"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </FieldWrapper>
            </div>
          </section>

          <Divider />

          {/* ── Debug: Inspect Existing Source ── */}
          <section>
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className="w-full flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            >
              <span className="flex-1 h-px bg-gray-100" />
              <span>Debug: Inspect Existing Source</span>
              <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${debugOpen ? 'rotate-180' : ''}`} />
              <span className="flex-1 h-px bg-gray-100" />
            </button>

            {debugOpen && (
              <div className="mt-4 space-y-4">
                {/* Step 1: List Azure/CIEM sources */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">
                    Step 1 — Find the source created via ISC UI
                  </p>
                  <button
                    type="button"
                    onClick={listAzureSources}
                    disabled={sourceListLoading}
                    className="px-4 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {sourceListLoading ? <Spinner className="text-indigo-600" /> : null}
                    {sourceListLoading ? 'Loading…' : '🔍 List Azure / CIEM Sources'}
                  </button>

                  {sourceListError && (
                    <p className="text-xs text-red-600 font-mono">{sourceListError}</p>
                  )}

                  {sourceList !== null && !sourceListError && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      {sourceList.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-gray-400 italic">No Azure/CIEM sources found in tenant.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Connector</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">ConnType</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Cluster</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sourceList.map((s) => (
                              <tr key={s.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-800">{s.name}</td>
                                <td className="px-3 py-2 font-mono text-gray-600">{s.connector}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${s.connectionType === 'direct' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {s.connectionType ?? 'n/a'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-400 font-mono">{s.cluster?.id ?? 'null'}</td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDebugSourceId(s.id)
                                      setDebugResult(null)
                                    }}
                                    className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                  >
                                    Inspect
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2: Inspect selected source */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">
                    Step 2 — Inspect connectorAttributes of a source
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={debugSourceId}
                      onChange={(e) => setDebugSourceId(e.target.value)}
                      placeholder="Source ID (auto-filled by Inspect button above)"
                      className="flex-1 px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={inspectSource}
                      disabled={debugLoading || !debugSourceId.trim()}
                      className="px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {debugLoading ? <Spinner className="text-blue-600" /> : null}
                      {debugLoading ? 'Fetching…' : 'Fetch Details'}
                    </button>
                  </div>
                </div>

                {debugResult && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    {debugResult.error ? (
                      <div className="p-3 bg-red-50 text-xs text-red-700 font-mono">{debugResult.error}</div>
                    ) : (
                      <>
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex gap-4 text-xs text-gray-500">
                          <span>connector: <code className="font-mono text-gray-700">{debugResult.connector}</code></span>
                          <span>connectionType: <code className="font-mono text-gray-700">{debugResult.connectionType ?? 'n/a'}</code></span>
                          <span>cluster: <code className="font-mono text-gray-700">{debugResult.cluster ?? 'null'}</code></span>
                        </div>
                        <div className="bg-gray-900 p-4 overflow-auto max-h-64">
                          <p className="text-xs text-gray-400 mb-2 font-mono">connectorAttributes:</p>
                          <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                            {JSON.stringify(debugResult.connectorAttributes, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Progress banner */}
        {loading && (
          <div className="mx-8 mb-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Spinner className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  {phase === 'creating' && 'Creating source…'}
                  {phase === 'patching' && 'Saving credentials…'}
                  {phase === 'testing' && 'Testing connection…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {phase === 'creating' && 'Registering your CIEM Azure source with SailPoint ISC.'}
                  {phase === 'patching' && 'Encrypting and storing the Client Secret.'}
                  {phase === 'testing' && 'Verifying connectivity between SailPoint and your Azure environment.'}
                </p>
                <p className="text-xs text-blue-500 mt-1 font-mono">
                  {phase === 'creating' && 'Step 1/3'}
                  {phase === 'patching' && 'Step 2/3'}
                  {phase === 'testing' && 'Step 3/3'}
                </p>
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
                {phase === 'creating' && 'Creating Source…'}
                {phase === 'patching' && 'Saving Credentials…'}
                {phase === 'testing' && 'Testing Connection…'}
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

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function KeyIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg> }

function EyeIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> }

function EyeOffIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg> }
