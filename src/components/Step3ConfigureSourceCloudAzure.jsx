import { useState, useEffect, useRef, useCallback } from 'react'

const PREFILL_CREDS = {
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
  clientSecret: import.meta.env.VITE_AZURE_CLIENT_SECRET || '',
}

export default function Step3ConfigureSourceCloudAzure({ auth, initialConfig, onResult, onBack }) {
  const [form, setForm] = useState({
    sourceName: 'Azure Active Directory',
    description: 'Azure Active Directory',
    ownerQuery: '',
    ownerId: '',
    ownerName: '',
    clusterId: '',
    clusterName: '',
    connectorScriptName: 'azure-active-directory-angularsc',
    clientId: '',
    clientSecret: '',
    domainName: 'camsailpoint.onmicrosoft.com',
    isB2CTenant: false,
  })
  const [prefillActive, setPrefillActive] = useState(false)
  const [showSecrets, setShowSecrets] = useState({})

  useEffect(() => {
    if (initialConfig) setForm((prev) => ({ ...prev, ...initialConfig }))
  }, [initialConfig])

  useEffect(() => {
    if (initialConfig?.ownerId) return
    const autoFill = async () => {
      try {
        const res = await fetch('/api/v3/search', {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
          body: JSON.stringify({ indices: ['identities'], query: { query: 'SailPoint Services' }, sort: ['name'], limit: 5 }),
        })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data?.data ?? data?.items ?? [])
        const match = list.find((i) => (i.displayName || i.name || '').toLowerCase() === 'sailpoint services')
        if (match) {
          const label = match.displayName || match.name || match.id
          setForm((f) => ({ ...f, ownerQuery: label, ownerId: match.id, ownerName: label }))
        }
      } catch { /* silent */ }
    }
    autoFill()
  }, [auth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load clusters on mount
  useEffect(() => {
    loadClusters()
  }, [auth]) // eslint-disable-line react-hooks/exhaustive-deps

  const [identities, setIdentities] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [clusters, setClusters] = useState(null)
  const [clusterLoading, setClusterLoading] = useState(false)
  const [clusterError, setClusterError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('idle')

  const searchTimerRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const searchIdentities = useCallback(async (query) => {
    if (query.length < 2) { setIdentities([]); setShowDropdown(false); return }
    setSearchLoading(true); setSearchError(null)
    try {
      const res = await fetch('/api/v3/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
        body: JSON.stringify({ indices: ['identities'], query: { query }, sort: ['name'], limit: 10 }),
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (res.ok) {
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.items) ? data.items : []))
        setIdentities(list); setSearchError(null)
      } else {
        setIdentities([]); setSearchError({ status: res.status, message: data?.detailCode || data?.message || `HTTP ${res.status}`, raw: text.slice(0, 400) })
      }
    } catch (err) { setIdentities([]); setSearchError({ status: null, message: err.message, raw: null }) }
    finally { setSearchLoading(false); setShowDropdown(true) }
  }, [auth])

  const AZURE_CLUSTER_KEYWORDS = ['aws cluster']

  const loadClusters = async () => {
    setClusterLoading(true); setClusters(null); setClusterError(null)
    try {
      const res = await fetch('/api/v3/managed-clusters?limit=50', { headers: { Authorization: `Bearer ${auth.token}`, 'X-Tenant': auth.tenant } })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (!res.ok) { setClusterError(`HTTP ${res.status}: ${data?.message || text.slice(0, 200)}`); return }
      const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
      setClusters(list)
      setForm((prev) => {
        if (prev.clusterId) return prev
        const match = list.find((c) => AZURE_CLUSTER_KEYWORDS.some((kw) => (c.name || '').toLowerCase().includes(kw)))
        const auto = match ?? (list.length === 1 ? list[0] : null)
        if (!auto) return prev
        return { ...prev, clusterId: auto.id, clusterName: auto.name || auto.id }
      })
    } catch (err) { setClusterError(err.message) } finally { setClusterLoading(false) }
  }

  const handleOwnerInput = (e) => {
    const q = e.target.value
    setForm((f) => ({ ...f, ownerQuery: q, ownerId: '', ownerName: '' }))
    setFieldErrors((fe) => ({ ...fe, owner: undefined })); setSearchError(null)
    if (q.length < 2) setShowDropdown(false)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchIdentities(q), 350)
  }

  const selectIdentity = (identity) => {
    const label = identity.displayName || identity.name || identity.id
    setForm((f) => ({ ...f, ownerQuery: label, ownerId: identity.id, ownerName: label }))
    setFieldErrors((fe) => ({ ...fe, owner: undefined })); setShowDropdown(false); setIdentities([])
  }

  const setField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [field]: undefined }))
    if (prefillActive) setPrefillActive(false)
  }

  const applyPrefill = () => {
    if (prefillActive) {
      setForm((f) => ({ ...f, clientId: '', clientSecret: '' }))
      setPrefillActive(false)
    } else {
      setForm((f) => ({ ...f, ...PREFILL_CREDS }))
      setFieldErrors((fe) => ({ ...fe, clientId: undefined, clientSecret: undefined }))
      setPrefillActive(true)
    }
  }

  const validate = () => {
    const errs = {}
    if (!form.sourceName.trim()) errs.sourceName = 'Source name is required.'
    if (!form.ownerId) errs.owner = 'Select an owner from the search dropdown.'
    if (!form.clusterId.trim()) errs.clusterId = 'Cluster ID is required.'
    if (!form.clientId.trim()) errs.clientId = 'Client ID is required.'
    if (!form.clientSecret.trim()) errs.clientSecret = 'Client Secret is required.'
    if (!form.domainName.trim()) errs.domainName = 'Domain Name is required.'
    if (!form.connectorScriptName.trim()) errs.connectorScriptName = 'Connector script name is required.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    const savedConfig = { ...form }

    /* ── Step A: Create source ── */
    setPhase('creating')
    let sourceId, createResponseData

    try {
      const res = await fetch('/api/v3/sources?provisionAsCsv=false', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
        body: JSON.stringify({
          name: form.sourceName,
          description: form.description,
          owner: { type: 'IDENTITY', id: form.ownerId, name: form.ownerName },
          connector: form.connectorScriptName.trim(),
          cluster: { type: 'CLUSTER', id: form.clusterId.trim(), name: form.clusterName || form.clusterId.trim() },
        }),
      })
      const text = await res.text()
      try { createResponseData = JSON.parse(text) } catch { createResponseData = { _raw: text } }
      if (!res.ok) {
        setLoading(false); setPhase('idle')
        return onResult({ success: false, phase: 'create_source', sourceName: form.sourceName, error: `HTTP ${res.status}: ${createResponseData?.detailCode || createResponseData?.message || text.slice(0, 300)}`, rawResponse: createResponseData }, savedConfig)
      }
      sourceId = createResponseData?.id
    } catch (err) {
      setLoading(false); setPhase('idle')
      return onResult({ success: false, phase: 'create_source', sourceName: form.sourceName, error: err.message, rawResponse: null }, savedConfig)
    }

    /* ── Step B: Patch connection settings ── */
    setPhase('patching')
    let patchResponseData = null

    try {
      const patchOps = [
        { op: 'add', path: '/connectorAttributes/grantType', value: 'CLIENT_CREDENTIALS' },
        { op: 'add', path: '/connectorAttributes/clientID', value: form.clientId.trim() },
        { op: 'add', path: '/connectorAttributes/clientSecret', value: form.clientSecret.trim() },
        { op: 'add', path: '/connectorAttributes/username', value: null },
        { op: 'add', path: '/connectorAttributes/password', value: null },
        { op: 'add', path: '/connectorAttributes/authURL', value: null },
        { op: 'add', path: '/connectorAttributes/samlRequestBody', value: null },
        { op: 'add', path: '/connectorAttributes/refresh_token', value: null },
        { op: 'add', path: '/connectorAttributes/clientCertificate', value: null },
        { op: 'add', path: '/connectorAttributes/private_key', value: null },
        { op: 'add', path: '/connectorAttributes/privateKeyPassword', value: null },
        { op: 'add', path: '/connectorAttributes/domainName', value: form.domainName.trim() },
        { op: 'add', path: '/connectorAttributes/isB2CTenant', value: form.isB2CTenant },
        { op: 'add', path: '/connectorAttributes/isCaeEnabled', value: false },
      ]
      const res = await fetch(`/api/beta/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json-patch+json', 'X-Tenant': auth.tenant },
        body: JSON.stringify(patchOps),
      })
      const text = await res.text()
      try { patchResponseData = JSON.parse(text) } catch { patchResponseData = { _raw: text } }
      if (!res.ok) {
        setLoading(false); setPhase('idle')
        return onResult({ success: false, phase: 'patch_connection', sourceName: form.sourceName, sourceId, error: `HTTP ${res.status}: ${patchResponseData?.detailCode || patchResponseData?.message || text.slice(0, 300)}`, createResponse: createResponseData, rawResponse: patchResponseData }, savedConfig)
      }
    } catch (err) {
      setLoading(false); setPhase('idle')
      return onResult({ success: false, phase: 'patch_connection', sourceName: form.sourceName, sourceId, error: err.message, createResponse: createResponseData, rawResponse: null }, savedConfig)
    }

    /* ── Step C: Update account schema (remove risk attributes) ── */
    setPhase('patching-schema')

    try {
      const RISK_ATTRS = new Set(['riskDetail', 'riskLastUpdatedDateTime', 'riskLevel', 'riskState'])
      const schemasRes = await fetch(`/api/v3/sources/${sourceId}/schemas?limit=100&offset=0&count=true`, {
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
      })
      if (schemasRes.ok) {
        const schemasData = await schemasRes.json()
        const schemas = Array.isArray(schemasData) ? schemasData : (schemasData?.items ?? schemasData?.data ?? [])
        const accountSchema = schemas.find((s) => s.nativeObjectType === 'account' || s.name === 'account')
        if (accountSchema?.id) {
          const filteredSchema = { ...accountSchema, attributes: (accountSchema.attributes || []).filter((a) => !RISK_ATTRS.has(a.name)) }
          await fetch(`/api/v3/sources/${sourceId}/schemas/${accountSchema.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
            body: JSON.stringify(filteredSchema),
          })
        }
      }
    } catch { /* non-fatal: proceed even if schema update fails */ }

    /* ── Step D: Test connection ── */
    setPhase('testing')

    let testResponseData = null

    try {
      const res = await fetch(`/api/beta/sources/${sourceId}/connector/test-configuration`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'X-Tenant': auth.tenant },
        body: '{}',
      })
      const text = await res.text()
      try { testResponseData = JSON.parse(text) } catch { testResponseData = { _raw: text } }

      const bodyStatus = testResponseData?.status
      const testPassed = res.ok && (bodyStatus === undefined || bodyStatus === null || String(bodyStatus).toUpperCase() === 'SUCCESS' || String(bodyStatus).toUpperCase() === 'PASSED')
      const testErrorMsg = testPassed ? null : res.ok
        ? `Connection test failed: ${Array.isArray(testResponseData?.errors) ? testResponseData.errors.join('; ') : testResponseData?.message || testResponseData?.detailCode || `status=${bodyStatus}`}`
        : `HTTP ${res.status}: ${testResponseData?.detailCode || testResponseData?.message || text.slice(0, 300)}`

      if (!testPassed) {
        setLoading(false); setPhase('idle')
        return onResult({ success: false, phase: 'test_connection', sourceName: form.sourceName, sourceId, error: testErrorMsg, createResponse: createResponseData, patchResponse: patchResponseData, rawResponse: testResponseData }, savedConfig)
      }
    } catch (err) {
      setLoading(false); setPhase('idle')
      return onResult({ success: false, phase: 'test_connection', sourceName: form.sourceName, sourceId, error: err.message, createResponse: createResponseData, patchResponse: patchResponseData, rawResponse: null }, savedConfig)
    }

    /* ── Step E: Mark connected + trigger account aggregation ── */
    setPhase('aggregating')

    try {
      await fetch(`/api/beta/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json-patch+json', 'X-Tenant': auth.tenant },
        body: JSON.stringify([{ op: 'add', path: '/connectorAttributes/sourceConnected', value: true }]),
      })
    } catch { /* non-fatal */ }

    let aggError = null
    try {
      const fd = new FormData()
      fd.append('disableOptimization', 'false')
      const aggRes = await fetch(`/api/beta/sources/${sourceId}/load-accounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'X-Tenant': auth.tenant },
        body: fd,
      })
      if (!aggRes.ok) {
        const aggText = await aggRes.text()
        aggError = `HTTP ${aggRes.status}: ${aggText.slice(0, 200)}`
      }
    } catch (err) {
      aggError = err.message
    }

    setLoading(false); setPhase('idle')
    onResult({
      success: true,
      phase: 'aggregating',
      sourceName: form.sourceName,
      sourceId,
      error: null,
      warning: aggError ? `Account aggregation trigger failed: ${aggError}` : null,
      createResponse: createResponseData,
      patchResponse: patchResponseData,
      rawResponse: testResponseData,
    }, savedConfig)
  }

  const inputCls = (field) =>
    `w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-shadow focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${fieldErrors[field] ? 'border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400' : 'border-gray-300 bg-white'}`

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none"><path d="M20 8l-12 22h9l11-14L20 8z" fill="#0078D4" opacity=".7"/><path d="M28 16l-8 14 18 0L28 16z" fill="#0078D4"/></svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Azure Active Directory Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">Configure your Azure AD source with OAuth2 Client Credentials.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="px-8 py-7 space-y-8">
          {/* ── Source Details ── */}
          <section>
            <SectionHeading>Source Details</SectionHeading>
            <div className="space-y-5">
              <FieldWrapper label="Source Name" required error={fieldErrors.sourceName}>
                <input type="text" value={form.sourceName} onChange={setField('sourceName')} className={inputCls('sourceName')} disabled={loading} />
              </FieldWrapper>
              <FieldWrapper label="Description">
                <input type="text" value={form.description} onChange={setField('description')} className={inputCls('description')} disabled={loading} />
              </FieldWrapper>

              {/* Owner */}
              <FieldWrapper label="Source Owner" required error={fieldErrors.owner} hint="Type 2+ characters to search identities in your tenant.">
                <div ref={dropdownRef} className="relative">
                  <input type="text" value={form.ownerQuery} onChange={handleOwnerInput} placeholder="Search by name…" className={inputCls('owner') + ' pr-10'} disabled={loading} autoComplete="off" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {searchLoading && <Spinner className="text-gray-400" />}
                    {!searchLoading && form.ownerId && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                  </div>
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      {searchError ? (
                        <div className="p-4">
                          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Search failed{searchError.status ? ` · HTTP ${searchError.status}` : ''}</p>
                          <p className="text-sm text-red-700">{searchError.message}</p>
                          {searchError.raw && <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-2 mt-2 overflow-auto max-h-28 font-mono whitespace-pre-wrap">{searchError.raw}</pre>}
                        </div>
                      ) : identities.length > 0 ? identities.map((identity) => {
                        const displayName = identity.displayName || identity.name || identity.id
                        const email = identity.email || (Array.isArray(identity.emails) ? identity.emails[0] : null)
                        const alias = identity.alias || (Array.isArray(identity.aliases) ? identity.aliases[0] : null)
                        const subtitle = [email, alias].filter(Boolean).join(' · ')
                        return (
                          <button key={identity.id} type="button" onMouseDown={(e) => { e.preventDefault(); selectIdentity(identity) }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-blue-700">{displayName.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                              {subtitle && <div className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</div>}
                            </div>
                          </button>
                        )
                      }) : <div className="px-4 py-6 text-sm text-gray-400 text-center">No identities found for &ldquo;{form.ownerQuery}&rdquo;</div>}
                    </div>
                  )}
                </div>
                {form.ownerId && <p className="mt-1.5 text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />{form.ownerName}<span className="text-gray-400 font-normal">({form.ownerId})</span></p>}
              </FieldWrapper>

              {/* Cluster */}
              <FieldWrapper label="Virtual Appliance Cluster" required error={fieldErrors.clusterId} hint="The VA cluster that will handle this source's connectivity.">
                <div className="flex gap-2">
                  <select
                    value={form.clusterId}
                    onChange={(e) => {
                      const selected = (clusters || []).find((c) => c.id === e.target.value)
                      setForm((f) => ({ ...f, clusterId: e.target.value, clusterName: selected?.name || e.target.value }))
                      setFieldErrors((fe) => ({ ...fe, clusterId: undefined }))
                    }}
                    className={`flex-1 px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-shadow focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${fieldErrors.clusterId ? 'border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400' : 'border-gray-300 bg-white'} ${clusterLoading ? 'text-gray-400 cursor-wait' : ''}`}
                    disabled={loading || clusterLoading}
                  >
                    {clusterLoading || !clusters ? (
                      <option value="">Loading clusters…</option>
                    ) : clusters.length === 0 ? (
                      <option value="">No clusters available</option>
                    ) : (
                      <>
                        <option value="">Select a cluster…</option>
                        {clusters.map((c) => (
                          <option key={c.id} value={c.id}>{c.name || c.id}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <button type="button" onClick={loadClusters} disabled={loading || clusterLoading} title="Refresh cluster list" className="px-3 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center">
                    {clusterLoading ? <Spinner className="text-blue-600" /> : <RefreshIcon className="w-4 h-4" />}
                  </button>
                </div>
                {clusterError && <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1"><ExclamationIcon className="w-3.5 h-3.5 flex-shrink-0" />{clusterError}</p>}
                {form.clusterId && clusters && <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />{form.clusterName || form.clusterId}</p>}
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
              <FieldWrapper label="Grant Type" hint="Fixed to Client Credentials for this source type.">
                <input type="text" readOnly value="Client Credentials" className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed" />
              </FieldWrapper>

              <FieldWrapper label="Client ID" required error={fieldErrors.clientId} hint="Refer to Keeper: Azure Source for CIEM Configuration.">
                <input type="text" value={form.clientId} onChange={setField('clientId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls('clientId') + ' font-mono'} disabled={loading} spellCheck={false} autoComplete="off" />
              </FieldWrapper>

              <FieldWrapper label="Client Secret" required error={fieldErrors.clientSecret} hint="Refer to Keeper: Azure Source for CIEM Configuration.">
                <div className="relative">
                  <input type={showSecrets.clientSecret ? 'text' : 'password'} value={form.clientSecret} onChange={setField('clientSecret')} placeholder="Client Secret" className={inputCls('clientSecret') + ' font-mono pr-10'} disabled={loading} autoComplete="new-password" />
                  <button type="button" tabIndex={-1} onClick={() => setShowSecrets((s) => ({ ...s, clientSecret: !s.clientSecret }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showSecrets.clientSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </FieldWrapper>

              <FieldWrapper label="Domain Name" required error={fieldErrors.domainName} hint="Your Azure AD tenant domain (e.g. yourcompany.onmicrosoft.com).">
                <input type="text" value={form.domainName} onChange={setField('domainName')} placeholder="yourcompany.onmicrosoft.com" className={inputCls('domainName') + ' font-mono'} disabled={loading} spellCheck={false} />
              </FieldWrapper>

              <FieldWrapper label="Manage B2C Tenant" hint="Enable only if this is an Azure AD B2C tenant.">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isB2CTenant}
                    onChange={(e) => setForm((f) => ({ ...f, isB2CTenant: e.target.checked }))}
                    disabled={loading}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Manage B2C Tenant</span>
                </label>
              </FieldWrapper>
            </div>
          </section>

          <Divider />

          {/* ── Advanced ── */}
          <section>
            <SectionHeading>Advanced</SectionHeading>
            <FieldWrapper label="Connector Script Name" required error={fieldErrors.connectorScriptName}>
              <input type="text" value={form.connectorScriptName} onChange={setField('connectorScriptName')} placeholder="azure-active-directory-angularsc" className={inputCls('connectorScriptName') + ' font-mono'} disabled={loading} spellCheck={false} />
            </FieldWrapper>
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
                  {phase === 'patching' && 'Saving connection settings…'}
                  {phase === 'patching-schema' && 'Updating account schema…'}
                  {phase === 'testing' && 'Testing connection…'}
                  {phase === 'aggregating' && 'Triggering initial aggregation…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {phase === 'creating' && 'Registering your Azure AD source with SailPoint ISC.'}
                  {phase === 'patching' && 'Applying OAuth2 credentials and domain settings.'}
                  {phase === 'patching-schema' && 'Removing risk-related attributes from the account schema.'}
                  {phase === 'testing' && 'Verifying connectivity between SailPoint and Azure AD.'}
                  {phase === 'aggregating' && 'Starting account correlation and initial aggregation.'}
                </p>
                <p className="text-xs text-blue-500 mt-1 font-mono">
                  {phase === 'creating' && 'Step 1/5'}
                  {phase === 'patching' && 'Step 2/5'}
                  {phase === 'patching-schema' && 'Step 3/5'}
                  {phase === 'testing' && 'Step 4/5'}
                  {phase === 'aggregating' && 'Step 5/5'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-8 pb-8 flex gap-3">
          <button type="button" onClick={onBack} disabled={loading} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            <ChevronLeftIcon className="w-4 h-4" />Back
          </button>
          <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
            {loading ? (
              <><Spinner />{phase === 'creating' ? 'Creating Source…' : phase === 'patching' ? 'Saving Settings…' : phase === 'patching-schema' ? 'Updating Schema…' : phase === 'aggregating' ? 'Starting Aggregation…' : 'Testing Connection…'}</>
            ) : (
              <>Save &amp; Test Connection<BoltIcon className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Layout helpers ── */
function SectionHeading({ children }) {
  return <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5 flex items-center gap-2"><span className="flex-1 h-px bg-gray-100" />{children}<span className="flex-1 h-px bg-gray-100" /></h3>
}
function Divider() { return <div className="border-t border-gray-100" /> }
function FieldWrapper({ label, required, badge, hint, error, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {required && <span className="text-red-500 text-sm leading-none">*</span>}
        {badge && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">{badge}</span>}
      </div>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1"><ExclamationIcon className="w-3.5 h-3.5 flex-shrink-0" />{error}</p>
      : hint ? <p className="mt-1.5 text-xs text-gray-400">{hint}</p> : null}
    </div>
  )
}

/* ── Icons ── */
function Spinner({ className }) { return <svg className={`animate-spin w-4 h-4 ${className || ''}`} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> }
function CheckCircleIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> }
function ExclamationIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg> }
function ChevronLeftIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg> }
function BoltIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg> }
function RefreshIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> }
function KeyIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg> }
function EyeIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> }
function EyeOffIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg> }
