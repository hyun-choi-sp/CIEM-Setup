import { useState, useEffect, useRef, useCallback } from 'react'

const ORG_ID_PATTERN = /^\d{10,}$/
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const PREFILL_CREDS = {
  adminEmail: import.meta.env.VITE_GCP_ADMIN_EMAIL || '',
  credentials: (() => {
    try {
      return import.meta.env.VITE_GCP_CREDENTIALS ? JSON.stringify(JSON.parse(import.meta.env.VITE_GCP_CREDENTIALS), null, 2) : ''
    } catch {
      return import.meta.env.VITE_GCP_CREDENTIALS || ''
    }
  })(),
}

export default function Step3ConfigureSourceGcp({ auth, initialConfig, onResult, onBack }) {
  const [form, setForm] = useState({
    sourceName: 'CIEM GCP',
    description: 'CIEM source for GCP',
    ownerQuery: '',
    ownerId: '',
    ownerName: '',
    connectorScriptName: 'ciem-gcp-connector-script',
    clusterId: '52d554752d9b43aab1ea4a1edcfa4fc2',
    organizationId: '1063145834985',
    adminEmail: '',
    credentials: '',
  })
  const [prefillActive, setPrefillActive] = useState(false)

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
  const [phase, setPhase] = useState('idle') // 'idle' | 'creating' | 'patching' | 'testing' | 'finalizing'
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectMatches, setDetectMatches] = useState(null)
  const [detectError, setDetectError] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugError, setDebugError] = useState(null)
  const [baselineSourceId, setBaselineSourceId] = useState('c3b91ed703354187ab8ab81e3309741f')
  const [candidateSourceId, setCandidateSourceId] = useState('')
  const [baselineSource, setBaselineSource] = useState(null)
  const [candidateSource, setCandidateSource] = useState(null)

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
            query: { query },
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
    if ((field === 'adminEmail' || field === 'credentials') && prefillActive) setPrefillActive(false)
  }

  const applyPrefill = () => {
    if (prefillActive) {
      setForm((f) => ({ ...f, adminEmail: '', credentials: '' }))
      setPrefillActive(false)
    } else {
      setForm((f) => ({ ...f, ...PREFILL_CREDS }))
      setFieldErrors((fe) => ({ ...fe, adminEmail: undefined, credentials: undefined }))
      setPrefillActive(true)
    }
  }

  const handleCredentialsFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setForm((f) => ({ ...f, credentials: text }))
      setFieldErrors((fe) => ({ ...fe, credentials: undefined }))
    } catch (err) {
      setFieldErrors((fe) => ({
        ...fe,
        credentials: `Failed to read file: ${err.message}`,
      }))
    } finally {
      e.target.value = ''
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
      const keywords = ['gcp', 'google', 'ciem', 'cam', 'workspace']
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

  const fetchSource = async (sourceId) => {
    const res = await fetch(`/api/v3/sources/${sourceId}`, {
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
      throw new Error(`HTTP ${res.status}: ${data?.message || data?.detailCode || text.slice(0, 300)}`)
    }

    return data
  }

  const fetchManagedCluster = async (clusterId) => {
    const res = await fetch(`/api/v3/managed-clusters/${clusterId}`, {
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
      throw new Error(`HTTP ${res.status}: ${data?.message || data?.detailCode || text.slice(0, 300)}`)
    }

    return data
  }

  const toBase64Url = (input) => {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  const pemToArrayBuffer = (pem) => {
    const base64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }

  const encryptForCluster = async ({ sourceId, publicKeyPem, plaintext }) => {
    const protectedHeader = {
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      'X-SP-Policy': {
        allowedSources: [sourceId],
      },
    }

    const protectedHeaderBytes = textEncoder.encode(JSON.stringify(protectedHeader))
    const protectedHeaderB64 = toBase64Url(protectedHeaderBytes)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cekBytes = crypto.getRandomValues(new Uint8Array(32))

    const rsaKey = await crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(publicKeyPem),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    )

    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      rsaKey,
      cekBytes
    )

    const aesKey = await crypto.subtle.importKey(
      'raw',
      cekBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )

    const encryptedPayload = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: textEncoder.encode(protectedHeaderB64),
          tagLength: 128,
        },
        aesKey,
        textEncoder.encode(plaintext)
      )
    )

    const tag = encryptedPayload.slice(encryptedPayload.length - 16)
    const ciphertext = encryptedPayload.slice(0, encryptedPayload.length - 16)

    // ISC UI 포맷: 3_{<JWE_compact>}  — curly brace로 감싸야 connector가 복호화함
    return `3_{${protectedHeaderB64}.${toBase64Url(encryptedKey)}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}.${toBase64Url(tag)}}`
  }

  const decodeJweHeader = (value) => {
    if (!value || typeof value !== 'string' || !value.startsWith('3_')) return null
    try {
      const firstDot = value.indexOf('.')
      if (firstDot === -1) return null
      const protectedHeaderB64 = value.slice(2, firstDot)
      const padded = protectedHeaderB64
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(protectedHeaderB64.length / 4) * 4, '=')
      return JSON.parse(textDecoder.decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))))
    } catch {
      return null
    }
  }

  const runDebugCompare = async () => {
    if (!baselineSourceId.trim() || !candidateSourceId.trim()) {
      setDebugError('Compare하려면 정상 소스 ID와 비교 대상 소스 ID가 모두 필요합니다.')
      return
    }

    setDebugLoading(true)
    setDebugError(null)
    setBaselineSource(null)
    setCandidateSource(null)

    try {
      const [baseline, candidate] = await Promise.all([
        fetchSource(baselineSourceId.trim()),
        fetchSource(candidateSourceId.trim()),
      ])
      setBaselineSource(baseline)
      setCandidateSource(candidate)
    } catch (err) {
      setDebugError(err.message)
    } finally {
      setDebugLoading(false)
    }
  }

  const validate = () => {
    const errs = {}
    if (!form.sourceName.trim()) errs.sourceName = 'Source name is required.'
    if (!form.ownerId) errs.owner = 'Select an owner from the search dropdown.'
    if (!form.connectorScriptName.trim()) errs.connectorScriptName = 'Connector script name is required.'
    if (!form.organizationId.trim()) {
      errs.organizationId = 'Organization ID is required.'
    } else if (!ORG_ID_PATTERN.test(form.organizationId.trim())) {
      errs.organizationId = 'Use the numeric GCP organization ID.'
    }
    if (!form.adminEmail.trim()) errs.adminEmail = 'Admin email is required.'
    if (!form.credentials.trim()) {
      errs.credentials = 'Credentials JSON is required.'
    } else {
      try {
        JSON.parse(form.credentials)
      } catch {
        errs.credentials = 'Credentials must be valid JSON text.'
      }
    }
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
      clusterId: form.clusterId,
      organizationId: form.organizationId,
      adminEmail: form.adminEmail,
      credentials: form.credentials,
    }

    setPhase('creating')

    let sourceId
    let createResponseData
    let clusterId

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
      clusterId = createResponseData?.cluster?.id || form.clusterId.trim()
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

    setPhase('patching')

    let patchedSource = null
    let localEncryptedGcpJSON = null

    try {
      if (!clusterId) {
        throw new Error('Cluster ID was not returned from source creation.')
      }

      const cluster = await fetchManagedCluster(clusterId)
      const gcpJSON = await encryptForCluster({
        sourceId,
        publicKeyPem: cluster.publicKey || cluster.keyPair?.publicKey,
        plaintext: form.credentials.trim(),
      })
      localEncryptedGcpJSON = gcpJSON

      const patchRes = await fetch(`/api/beta/sources/${sourceId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json-patch+json',
          'X-Tenant': auth.tenant,
        },
        body: JSON.stringify([
          {
            op: 'add',
            path: '/connectorAttributes/organizationId',
            value: form.organizationId.trim(),
          },
          {
            op: 'add',
            path: '/connectorAttributes/adminEmail',
            value: form.adminEmail.trim(),
          },
          {
            op: 'add',
            path: '/connectorAttributes/gcpJSON',
            value: gcpJSON,
          },
        ]),
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
            localEncryptedGcpJSON,
            localEncryptedGcpJSONHeader: decodeJweHeader(localEncryptedGcpJSON),
            rawResponse: patchData,
          },
          savedConfig
        )
        return
      }

      patchedSource = await fetchSource(sourceId)
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
          localEncryptedGcpJSON,
          localEncryptedGcpJSONHeader: decodeJweHeader(localEncryptedGcpJSON),
          rawResponse: patchedSource,
        },
        savedConfig
      )
      return
    }

    setPhase('testing')

    try {
      const res = await fetch(`/api/beta/sources/${sourceId}/connector/test-configuration`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'X-Tenant': auth.tenant,
        },
        body: '{}',
      })

      const text = await res.text()
      let testResponseData
      try {
        testResponseData = JSON.parse(text)
      } catch {
        testResponseData = { _raw: text }
      }

      // ISC UI 기준: status === "SUCCESS" 만 성공, 그 외는 실패
      const bodyStatus = testResponseData?.status
      const testPassed =
        res.ok &&
        (bodyStatus === undefined ||
          bodyStatus === null ||
          String(bodyStatus).toUpperCase() === 'SUCCESS' ||
          String(bodyStatus).toUpperCase() === 'PASSED')

      if (!testPassed) {
        setLoading(false)
        setPhase('idle')
        const testErrorMsg = res.ok
          ? `Connection test failed: ${
              testResponseData?.details?.error ||
              Array.isArray(testResponseData?.errors)
                ? testResponseData.errors?.join('; ')
                : testResponseData?.message ||
                  testResponseData?.detailCode ||
                  `status=${bodyStatus}`
            }`
          : `HTTP ${res.status}: ${
              testResponseData?.detailCode ||
              testResponseData?.message ||
              text.slice(0, 300)
            }`
        onResult(
          {
            success: false,
            phase: 'test_connection',
            sourceName: form.sourceName,
            sourceId,
            error: testErrorMsg,
            createResponse: createResponseData,
            patchResponse: patchedSource,
            localEncryptedGcpJSON,
            localEncryptedGcpJSONHeader: decodeJweHeader(localEncryptedGcpJSON),
            rawResponse: testResponseData,
          },
          savedConfig
        )
        return
      }

      // ── Step D: sourceConnected=true PATCH (ISC UI가 테스트 성공 후 수행) ──
      setPhase('finalizing')

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
        // sourceConnected 패치 실패는 소스 생성/테스트 성공에 영향을 주지 않으므로 무시
      }

      setLoading(false)
      setPhase('idle')

      onResult(
        {
          success: true,
          phase: 'test_connection',
          sourceName: form.sourceName,
          sourceId,
          error: null,
          createResponse: createResponseData,
          patchResponse: patchedSource,
          localEncryptedGcpJSON,
          localEncryptedGcpJSONHeader: decodeJweHeader(localEncryptedGcpJSON),
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
          patchResponse: patchedSource,
          localEncryptedGcpJSON,
          localEncryptedGcpJSONHeader: decodeJweHeader(localEncryptedGcpJSON),
          rawResponse: null,
        },
        savedConfig
      )
    }
  }

  const finishWithTestUnavailable = (sourceId, createResponseData, rawResponse, savedConfig) => {
    setLoading(false)
    setPhase('idle')
    onResult(
      {
        success: true,
        phase: 'test_connection_unavailable',
        sourceName: form.sourceName,
        sourceId,
        warning: 'The source was created, but this tenant does not expose the GCP connector test endpoint over API. Verify the connection from the ISC UI if needed.',
        createResponse: createResponseData,
        rawResponse,
      },
      savedConfig
    )
    setCandidateSourceId(sourceId)
  }

  const inputCls = (field) =>
    `w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none transition-shadow
     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
     ${fieldErrors[field] ? 'border-red-400 bg-red-50 focus:ring-red-300 focus:border-red-400' : 'border-gray-300 bg-white'}`

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-4">
        <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-red-600 font-bold text-sm tracking-tight">GCP</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">CIEM GCP Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure your source details and Google Cloud Platform connection settings.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="px-8 py-7 space-y-8">
          <section>
            <SectionHeading>Source Details</SectionHeading>
            <div className="space-y-5">
              <FieldWrapper label="Source Name" required error={fieldErrors.sourceName}>
                <input
                  type="text"
                  value={form.sourceName}
                  onChange={setField('sourceName')}
                  className={inputCls('sourceName')}
                  disabled={loading}
                />
              </FieldWrapper>

              <FieldWrapper label="Description">
                <input
                  type="text"
                  value={form.description}
                  onChange={setField('description')}
                  className={inputCls('description')}
                  disabled={loading}
                />
              </FieldWrapper>

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
                    placeholder="e.g. ciem-gcp"
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

                {detectError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <ExclamationIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    {detectError}
                  </p>
                )}
                {detectMatches !== null && !detectError && (
                  <div className="mt-2">
                    {detectMatches.length === 0 ? (
                      <p className="text-xs text-amber-600">No GCP/CIEM connectors found in tenant. Enter the script name manually.</p>
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

              <FieldWrapper
                label="Proxy Cluster Fallback ID"
                badge="Advanced"
                error={fieldErrors.clusterId}
                hint="Normally returned automatically by the create-source response. This fallback is only used if the response omits cluster data."
              >
                <input
                  type="text"
                  value={form.clusterId}
                  onChange={setField('clusterId')}
                  placeholder="52d554752d9b43aab1ea4a1edcfa4fc2"
                  className={inputCls('clusterId') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              <FieldWrapper
                label="Organization ID"
                required
                error={fieldErrors.organizationId}
                hint="Enter the numeric GCP Organization ID from the Google Cloud Console."
              >
                <input
                  type="text"
                  value={form.organizationId}
                  onChange={setField('organizationId')}
                  placeholder="1063145834985"
                  className={inputCls('organizationId') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              <FieldWrapper
                label="Email with Admin Privileges"
                required
                error={fieldErrors.adminEmail}
                hint="This must have admin access to the Google Admin Console and match your organization domain."
              >
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={setField('adminEmail')}
                  placeholder="admin@example.com"
                  className={inputCls('adminEmail') + ' font-mono'}
                  disabled={loading}
                  spellCheck={false}
                />
              </FieldWrapper>

              <FieldWrapper
                label="Credentials JSON"
                required
                error={fieldErrors.credentials}
                hint="Paste the full JSON key for the GCP service account."
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer">
                      <UploadIcon className="w-4 h-4" />
                      Upload JSON File
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleCredentialsFile}
                        className="hidden"
                        disabled={loading}
                      />
                    </label>
                    <span className="text-xs text-gray-400">
                      Or paste the JSON content below.
                    </span>
                  </div>

                  <textarea
                    value={form.credentials}
                    onChange={setField('credentials')}
                    placeholder='{"type":"service_account", ...}'
                    className={inputCls('credentials') + ' min-h-56 font-mono resize-y'}
                    disabled={loading}
                    spellCheck={false}
                  />
                </div>
              </FieldWrapper>
            </div>
          </section>

          <Divider />

          <section>
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className="w-full flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            >
              <span className="flex-1 h-px bg-gray-100" />
              <span>Debug: Compare GCP Sources</span>
              <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${debugOpen ? 'rotate-180' : ''}`} />
              <span className="flex-1 h-px bg-gray-100" />
            </button>

            {debugOpen && (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-gray-500">
                  정상 GCP 소스와 앱으로 생성한 GCP 소스를 조회해서 <code className="font-mono">connectionType</code>, <code className="font-mono">cluster</code>, <code className="font-mono">connectorAttributes</code> 차이를 바로 확인합니다.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldWrapper label="Baseline Source ID" hint="Known-good GCP source created from ISC UI.">
                    <input
                      type="text"
                      value={baselineSourceId}
                      onChange={(e) => setBaselineSourceId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      spellCheck={false}
                    />
                  </FieldWrapper>

                  <FieldWrapper label="Candidate Source ID" hint="New source created by this app.">
                    <input
                      type="text"
                      value={candidateSourceId}
                      onChange={(e) => setCandidateSourceId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      spellCheck={false}
                    />
                  </FieldWrapper>
                </div>

                <button
                  type="button"
                  onClick={runDebugCompare}
                  disabled={debugLoading}
                  className="px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {debugLoading ? <Spinner className="text-blue-600" /> : null}
                  {debugLoading ? 'Comparing…' : 'Compare Sources'}
                </button>

                {debugError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-mono">
                    {debugError}
                  </div>
                )}

                {(baselineSource || candidateSource) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <DebugSourceCard title="Baseline Source" data={baselineSource} />
                    <DebugSourceCard title="Candidate Source" data={candidateSource} />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {loading && (
          <div className="mx-8 mb-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Spinner className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  {phase === 'creating' && 'Creating source…'}
                  {phase === 'patching' && 'Saving credentials…'}
                  {phase === 'testing' && 'Testing connection…'}
                  {phase === 'finalizing' && 'Finalizing…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {phase === 'creating' && 'Registering your CIEM GCP source with SailPoint ISC.'}
                  {phase === 'patching' && 'Saving the service account JSON to the source configuration.'}
                  {phase === 'testing' && 'Verifying connectivity between SailPoint and your GCP organization.'}
                  {phase === 'finalizing' && 'Marking source as connected.'}
                </p>
                <p className="text-xs text-blue-500 mt-1 font-mono">
                  {phase === 'creating' && 'Step 1/4'}
                  {phase === 'patching' && 'Step 2/4'}
                  {phase === 'testing' && 'Step 3/4'}
                  {phase === 'finalizing' && 'Step 4/4'}
                </p>
              </div>
            </div>
          </div>
        )}

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
                {phase === 'finalizing' && 'Finalizing…'}
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

function FieldWrapper({ label, required, hint, error, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {required && <span className="text-red-500 text-sm leading-none">*</span>}
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function KeyIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
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

function UploadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16.5v1A2.5 2.5 0 006.5 20h11a2.5 2.5 0 002.5-2.5v-1" />
    </svg>
  )
}

function DebugSourceCard({ title, data }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
      </div>
      {!data ? (
        <p className="px-4 py-6 text-xs text-gray-400 italic">No data loaded.</p>
      ) : (
        <>
          <div className="px-4 py-3 text-xs text-gray-600 space-y-1 border-b border-gray-100">
            <p>id: <code className="font-mono text-gray-800">{data.id}</code></p>
            <p>connector: <code className="font-mono text-gray-800">{data.connector ?? 'n/a'}</code></p>
            <p>connectionType: <code className="font-mono text-gray-800">{data.connectionType ?? 'n/a'}</code></p>
            <p>cluster: <code className="font-mono text-gray-800">{data.cluster?.id ?? 'null'}</code></p>
            <p>type: <code className="font-mono text-gray-800">{data.type ?? 'n/a'}</code></p>
          </div>
          <div className="bg-gray-900 p-4 overflow-auto max-h-80">
            <p className="text-xs text-gray-400 mb-2 font-mono">connectorAttributes</p>
            <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
              {JSON.stringify(data.connectorAttributes ?? {}, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
