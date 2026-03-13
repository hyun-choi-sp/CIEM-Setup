import { useState } from 'react'

export default function Step4Result({ result, onGoBack, onReset }) {
  const [showCreateResponse, setShowCreateResponse] = useState(false)
  const [showTestResponse, setShowTestResponse] = useState(false)

  if (!result) return null

  const { success, phase, sourceName, sourceId, error, createResponse, rawResponse } = result

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Status banner */}
      <div
        className={`px-8 py-8 flex flex-col items-center text-center ${
          success
            ? 'bg-gradient-to-br from-green-50 to-emerald-50'
            : 'bg-gradient-to-br from-red-50 to-rose-50'
        }`}
      >
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-inner ${
            success ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          {success ? (
            <CheckCircleIcon className="w-11 h-11 text-green-600" />
          ) : (
            <XCircleIcon className="w-11 h-11 text-red-500" />
          )}
        </div>

        <h2 className={`text-2xl font-bold ${success ? 'text-green-900' : 'text-red-900'}`}>
          {success
            ? 'Source Created Successfully'
            : phase === 'create_source'
            ? 'Source Creation Failed'
            : 'Connection Test Failed'}
        </h2>
        <p className={`text-sm mt-2 max-w-md ${success ? 'text-green-700' : 'text-red-700'}`}>
          {success
            ? 'Connection test passed. Your CIEM AWS source is ready to use in SailPoint ISC.'
            : phase === 'create_source'
            ? 'The source could not be created. Review the error below and go back to correct the configuration.'
            : 'The source was created, but the connection test failed. Check your Role ARN and AWS trust policy, then try again.'}
        </p>
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
              <Row
                label="Status"
                value={
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        success ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    {success ? 'Connected' : 'Failed'}
                  </span>
                }
              />
              {phase === 'test_connection' && (
                <Row label="Phase failed" value="Connection test" />
              )}
            </tbody>
          </table>
        </div>

        {/* Error detail */}
        {!success && error && (
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
        {!success &&
          error &&
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
              <li>Your tenant uses a <strong>different connector script name</strong>. Go back and correct the <em>Connector Script Name</em> field (e.g. <code className="bg-amber-100 px-1 rounded font-mono text-xs">ciem-aws</code> vs a tenant-specific variant).</li>
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
          {rawResponse && (
            <CollapsibleJSON
              title={
                phase === 'create_source'
                  ? 'Create Source — Error Response'
                  : 'Test Connection — API Response'
              }
              data={rawResponse}
              open={showTestResponse}
              onToggle={() => setShowTestResponse((v) => !v)}
            />
          )}
          {!createResponse && !rawResponse && (
            <p className="text-xs text-gray-400 text-center italic">No API response data available.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {!success && (
            <button
              onClick={onGoBack}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Go Back &amp; Edit
            </button>
          )}
          <button
            onClick={onReset}
            className={`flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-colors ${
              success
                ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white'
                : 'px-5 bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {success ? (
              <>
                Configure Another Source
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

function Row({ label, value }) {
  return (
    <tr>
      <td className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap w-44">{label}</td>
      <td className="px-4 py-3 text-gray-900">{value}</td>
    </tr>
  )
}

function CollapsibleJSON({ title, data, open, onToggle }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <CodeIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
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

function ExclamationIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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
