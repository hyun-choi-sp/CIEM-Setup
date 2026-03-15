import { useState } from 'react'

export default function Step4Result({ result, auth, onGoBack, onAddAnother }) {
  const [showCreateResponse, setShowCreateResponse] = useState(false)
  const [showPatchResponse, setShowPatchResponse] = useState(false)
  const [showLocalEncrypted, setShowLocalEncrypted] = useState(false)
  const [showTestResponse, setShowTestResponse] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryResult, setRetryResult] = useState(null) // null | { success, rawResponse, error }

  if (!result) return null

  const {
    success,
    phase,
    sourceName,
    sourceId,
    error,
    warning,
    createResponse,
    patchResponse,
    localEncryptedGcpJSON,
    localEncryptedGcpJSONHeader,
    rawResponse,
  } = result

  // Connection test failure after source was created — special "partial" state
  const isTestFailed = !success && phase === 'test_connection'
  // After a successful retry, treat as fully successful
  const testPassed = (success && phase === 'test_connection') || retryResult?.success

  const retryConnectionTest = async () => {
    if (!auth || !sourceId) return
    setRetrying(true)
    setRetryResult(null)
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
      let data
      try { data = JSON.parse(text) } catch { data = { _raw: text } }
      const retrySuccess = res.ok && data?.status !== 'FAILURE'
      setRetryResult({
        success: retrySuccess,
        rawResponse: data,
        error: retrySuccess
          ? null
          : data?.status === 'FAILURE'
          ? data?.details?.error || `Connection test failed: ${JSON.stringify(data?.details ?? {})}`
          : `HTTP ${res.status}: ${data?.detailCode || data?.message || text.slice(0, 300)}`,
      })
    } catch (err) {
      setRetryResult({ success: false, rawResponse: null, error: err.message })
    } finally {
      setRetrying(false)
    }
  }

  /* ── Banner styles ── */
  let bannerBg, iconEl, titleText, subtitleText

  if (isTestFailed) {
    // Source created, but test failed → amber warning tone
    bannerBg = 'bg-gradient-to-br from-amber-50 to-orange-50'
    iconEl = <WarningIcon className="w-11 h-11 text-amber-500" />
    titleText = retryResult
      ? retryResult.success
        ? 'Connection Test Passed'
        : 'Connection Test Still Failing'
      : 'Source Created — Connection Test Failed'
    subtitleText = retryResult
      ? retryResult.success
        ? 'The connection to your cloud environment is now verified. Your CIEM source is ready to use.'
        : 'The connection test failed again. Review the error details and check your credentials or connector settings.'
      : 'The CIEM source was registered and credentials were saved, but the connection test did not pass. You can retry the test without recreating the source.'
  } else if (testPassed || (success && phase !== 'test_connection')) {
    bannerBg = 'bg-gradient-to-br from-green-50 to-emerald-50'
    iconEl = <CheckCircleIcon className="w-11 h-11 text-green-600" />
    titleText = phase === 'test_connection_unavailable' ? 'Source Created' : 'Source Created Successfully'
    subtitleText = phase === 'test_connection_unavailable'
      ? 'The source and credentials were saved. Automatic API-based connection testing is not available for this connector on this tenant.'
      : phase === 'aggregating'
      ? 'Connection test passed and initial aggregation has been triggered. Accounts will appear in SailPoint ISC shortly.'
      : 'Connection test passed. Your CIEM source is ready to use in SailPoint ISC.'
  } else {
    bannerBg = 'bg-gradient-to-br from-red-50 to-rose-50'
    iconEl = <XCircleIcon className="w-11 h-11 text-red-500" />
    titleText = phase === 'create_source'
      ? 'Source Creation Failed'
      : phase === 'patch_secret'
      ? 'Credential Save Failed'
      : 'Failed'
    subtitleText = phase === 'create_source'
      ? 'The source could not be created. Review the error below and go back to correct the configuration.'
      : phase === 'patch_secret'
      ? 'The source was created, but the credential payload could not be saved. Review the response and verify the connector attribute names.'
      : error || 'An unexpected error occurred.'
  }

  /* ── Phase step indicators ── */
  const isAggregating = success && phase === 'aggregating'
  const aggTriggered = isAggregating && !warning  // aggregation call itself succeeded
  const steps = isTestFailed
    ? [
        { label: 'Source Created', done: true },
        { label: 'Credentials Saved', done: true },
        { label: 'Connection Test', done: retryResult?.success ?? false, failed: !retryResult?.success },
      ]
    : isAggregating
    ? [
        { label: 'Source Created', done: true },
        { label: 'Credentials Saved', done: true },
        { label: 'Connection Test', done: true },
        { label: 'Aggregation', done: true, queued: aggTriggered, warn: !aggTriggered },
      ]
    : null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Status banner */}
      <div className={`px-8 py-8 flex flex-col items-center text-center ${bannerBg}`}>
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-inner ${
            isTestFailed
              ? retryResult?.success ? 'bg-green-100' : 'bg-amber-100'
              : (testPassed || isAggregating) ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          {retryResult?.success
            ? <CheckCircleIcon className="w-11 h-11 text-green-600" />
            : iconEl}
        </div>
        <h2 className={`text-2xl font-bold ${
          isTestFailed
            ? retryResult?.success ? 'text-green-900' : 'text-amber-900'
            : (testPassed || isAggregating) ? 'text-green-900' : 'text-red-900'
        }`}>
          {titleText}
        </h2>
        <p className={`text-sm mt-2 max-w-md ${
          isTestFailed
            ? retryResult?.success ? 'text-green-700' : 'text-amber-700'
            : (testPassed || isAggregating) ? 'text-green-700' : 'text-red-700'
        }`}>
          {subtitleText}
        </p>

        {/* Step indicators */}
        {steps && (
          <div className="flex items-center gap-1 mt-6">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-1">
                {i > 0 && (
                  <div className={`w-6 h-px flex-shrink-0 ${
                    isAggregating ? 'bg-green-300' : (s.done || steps[i-1].done ? 'bg-amber-300' : 'bg-gray-200')
                  }`} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                    isAggregating
                      ? s.warn ? 'bg-amber-400' : 'bg-green-500'
                      : s.done ? 'bg-green-500' : s.failed ? (retryResult?.success ? 'bg-green-500' : 'bg-red-400') : 'bg-gray-300'
                  }`}>
                    {/* Icon inside circle */}
                    {isAggregating && s.queued ? (
                      /* Lightning bolt = aggregation triggered/queued */
                      <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 2L4.09 12.97H11L10 22l8.91-10.97H13L13 2z" />
                      </svg>
                    ) : isAggregating && s.warn ? (
                      /* Warning = aggregation trigger failed */
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    ) : (s.done || retryResult?.success) ? (
                      /* Check */
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      /* X */
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs font-medium text-center leading-tight max-w-[64px] ${
                    isAggregating ? 'text-green-800' : 'text-amber-800'
                  }`}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-8 py-7 space-y-6">
        {/* Summary table */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <Row label="Source Name" value={sourceName} />
              {sourceId && (
                <Row
                  label="Source ID"
                  value={
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                      {sourceId}
                    </span>
                  }
                />
              )}
              {isTestFailed ? (
                <>
                  <Row label="Source Creation" value={<StatusBadge ok={true} label="Succeeded" />} />
                  <Row label="Credentials Saved" value={<StatusBadge ok={true} label="Succeeded" />} />
                  <Row
                    label="Connection Test"
                    value={
                      retryResult
                        ? <StatusBadge ok={retryResult.success} label={retryResult.success ? 'Passed' : 'Failed'} />
                        : <StatusBadge ok={false} label="Failed" />
                    }
                  />
                </>
              ) : isAggregating ? (
                <>
                  <Row label="Source Creation" value={<StatusBadge ok={true} label="Succeeded" />} />
                  <Row label="Credentials Saved" value={<StatusBadge ok={true} label="Succeeded" />} />
                  <Row label="Connection Test" value={<StatusBadge ok={true} label="Passed" />} />
                  <Row
                    label="Account Aggregation"
                    value={<StatusBadge ok={aggTriggered} queued={aggTriggered} label={aggTriggered ? 'Queued' : 'Trigger Failed'} />}
                  />
                </>
              ) : (
                <Row
                  label="Status"
                  value={
                    <StatusBadge
                      ok={testPassed || (success && phase !== 'test_connection')}
                      label={
                        testPassed || (success && phase !== 'test_connection')
                          ? phase === 'test_connection_unavailable' ? 'Created' : 'Connected'
                          : 'Failed'
                      }
                    />
                  }
                />
              )}
              {phase === 'test_connection_unavailable' && (
                <Row label="Connection test" value="API endpoint not available" />
              )}
            </tbody>
          </table>
        </div>

        {/* Warning note */}
        {success && warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-2">
              <LightbulbIcon className="w-4 h-4" />
              Note
            </p>
            <p className="text-sm text-amber-800">{warning}</p>
          </div>
        )}

        {/* Retry result banner */}
        {retryResult && !retryResult.success && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-800 mb-1 flex items-center gap-2">
              <ExclamationIcon className="w-4 h-4" />
              Retry Failed
            </p>
            <pre className="text-sm text-red-700 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {retryResult.error}
            </pre>
          </div>
        )}
        {retryResult?.success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              Connection test passed on retry. Your CIEM source is ready to use.
            </p>
          </div>
        )}

        {/* Error detail (initial failure) */}
        {!success && error && !retryResult && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-800 mb-1 flex items-center gap-2">
              <ExclamationIcon className="w-4 h-4" />
              Error Detail
            </p>
            <pre className="text-sm text-red-700 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {error}
            </pre>
          </div>
        )}

        {/* Connector-not-found help banner */}
        {!success && error &&
          (error.toLowerCase().includes('connector') &&
            (error.toLowerCase().includes('not found') ||
              error.toLowerCase().includes('scriptname') ||
              error.toLowerCase().includes('unable to find connector'))) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <LightbulbIcon className="w-4 h-4 flex-shrink-0" />
              Connector not registered on this tenant
            </p>
            <p className="text-sm text-amber-800">
              ISC could not find a connector with the script name you provided. This usually means one of the following:
            </p>
            <ul className="text-sm text-amber-800 list-disc list-inside space-y-1 pl-1">
              <li>The <strong>CIEM module</strong> is not enabled for your tenant. Contact your SailPoint account team to enable it.</li>
              <li>Your tenant uses a <strong>different connector script name</strong>. Go back and correct the <em>Connector Script Name</em> field.</li>
              <li>You are on a <strong>staging / POC tenant</strong> — CIEM connectors may not be pre-installed there.</li>
            </ul>
          </div>
        )}

        {/* Raw API responses (collapsible) */}
        <div className="space-y-3">
          {createResponse && (
            <CollapsibleJSON
              title="Create Source — API Response"
              data={createResponse}
              open={showCreateResponse}
              onToggle={() => setShowCreateResponse((v) => !v)}
            />
          )}
          {patchResponse && (
            <CollapsibleJSON
              title="Patched Source — Current State"
              data={patchResponse}
              open={showPatchResponse}
              onToggle={() => setShowPatchResponse((v) => !v)}
            />
          )}
          {(localEncryptedGcpJSONHeader || localEncryptedGcpJSON) && (
            <CollapsibleJSON
              title="Local gcpJSON — Generated Before PATCH"
              data={{
                protectedHeader: localEncryptedGcpJSONHeader,
                preview: localEncryptedGcpJSON ? `${localEncryptedGcpJSON.slice(0, 220)}...` : null,
              }}
              open={showLocalEncrypted}
              onToggle={() => setShowLocalEncrypted((v) => !v)}
            />
          )}
          {rawResponse && (
            <CollapsibleJSON
              title={
                phase === 'create_source'
                  ? 'Create Source — Error Response'
                  : 'Connection Test — API Response'
              }
              data={rawResponse}
              open={showTestResponse}
              onToggle={() => setShowTestResponse((v) => !v)}
            />
          )}
          {retryResult?.rawResponse && (
            <CollapsibleJSON
              title="Connection Test Retry — API Response"
              data={retryResult.rawResponse}
              open={false}
              onToggle={() => {}}
            />
          )}
          {!createResponse && !rawResponse && (
            <p className="text-xs text-gray-400 text-center italic">No API response data available.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {/* Retry test button — only when source exists but test failed */}
          {isTestFailed && !retryResult?.success && sourceId && auth && (
            <button
              onClick={retryConnectionTest}
              disabled={retrying}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-xl transition-colors"
            >
              {retrying ? (
                <>
                  <Spinner className="text-white" />
                  Testing…
                </>
              ) : (
                <>
                  <RefreshIcon className="w-4 h-4" />
                  Retry Connection Test
                </>
              )}
            </button>
          )}

          {/* Go Back — for non-test failures, or test failure as secondary option */}
          {((!success && phase !== 'test_connection') || (isTestFailed && !retryResult?.success)) && (
            <button
              onClick={onGoBack}
              className={`flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-colors ${
                !isTestFailed ? 'flex-1' : ''
              }`}
            >
              <ChevronLeftIcon className="w-4 h-4" />
              {isTestFailed ? 'Edit Config' : 'Go Back & Edit'}
            </button>
          )}

          {/* Add Another / Start Over */}
          <button
            onClick={onAddAnother}
            className={`flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-colors ${
              testPassed || (success && phase !== 'test_connection')
                ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white'
                : isTestFailed && !retryResult?.success
                ? 'px-5 bg-gray-100 hover:bg-gray-200 text-gray-600'
                : 'px-5 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {testPassed || (success && phase !== 'test_connection') ? (
              <>
                Add Another Source
                <PlusIcon className="w-4 h-4" />
              </>
            ) : (
              'Start Over'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ ok, queued, label }) {
  const cls = queued
    ? 'bg-blue-100 text-blue-800'
    : ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  const dotCls = queued ? 'bg-blue-400 animate-pulse' : ok ? 'bg-green-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  )
}

function Row({ label, value }) {
  return (
    <tr>
      <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap w-44">{label}</td>
      <td className="px-4 py-3 text-gray-900">{value}</td>
    </tr>
  )
}

function CollapsibleJSON({ title, data, open: initialOpen, onToggle }) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const handleToggle = () => {
    setIsOpen((v) => !v)
    onToggle?.()
  }
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <CodeIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="bg-gray-900 overflow-auto max-h-80">
          <pre className="text-xs text-green-300 font-mono p-5 leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
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
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function XCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function WarningIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  )
}

function ExclamationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  )
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function CodeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
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

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function LightbulbIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  )
}
