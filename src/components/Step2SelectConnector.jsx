export default function Step2SelectConnector({ onSelect, auth }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">Select Connector Type</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose the type of CIEM source you want to configure.
        </p>
        {auth?.tenant && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-lg">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs font-medium text-green-700">
              Connected to {auth.tenant}.api.identitynow.com
            </span>
          </div>
        )}
      </div>

      <div className="px-8 py-7 space-y-3">
        {/* Available: CIEM AWS */}
        <button
          onClick={() => onSelect('ciem-aws')}
          className="w-full group flex items-center gap-5 p-5 border-2 border-gray-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-md transition-all duration-150 text-left"
        >
          <div className="w-14 h-14 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 transition-colors">
            <AwsLogo />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-semibold text-gray-900 group-hover:text-blue-800">
                CIEM AWS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Available
              </span>
            </div>
            <p className="text-sm text-gray-500 leading-snug">
              Cloud Infrastructure Entitlement Management for Amazon Web Services
            </p>
            <div className="flex gap-2 mt-2">
              <Tag>CIEM</Tag>
              <Tag>AWS IAM</Tag>
              <Tag>CloudTrail</Tag>
            </div>
          </div>

          <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
        </button>

        {/* Available: CIEM Azure */}
        <button
          onClick={() => onSelect('ciem-azure')}
          className="w-full group flex items-center gap-5 p-5 border-2 border-gray-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-md transition-all duration-150 text-left"
        >
          <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
            <AzureLogo />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-semibold text-gray-900 group-hover:text-blue-800">
                CIEM Azure
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Available
              </span>
            </div>
            <p className="text-sm text-gray-500 leading-snug">
              Cloud Infrastructure Entitlement Management for Microsoft Azure
            </p>
            <div className="flex gap-2 mt-2">
              <Tag>CIEM</Tag>
              <Tag>Azure RBAC</Tag>
              <Tag>Entra ID</Tag>
            </div>
          </div>

          <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors" />
        </button>

        {/* Coming soon: GCP */}
        <ComingSoonCard
          logo={<GcpLogo />}
          name="CIEM GCP"
          description="Cloud Infrastructure Entitlement Management for Google Cloud Platform"
          tags={['CIEM', 'GCP IAM', 'Cloud Logging']}
          logoBg="bg-red-50 border-red-100"
        />
      </div>
    </div>
  )
}

function ComingSoonCard({ logo, name, description, tags, logoBg }) {
  return (
    <div className="w-full flex items-center gap-5 p-5 border-2 border-gray-100 rounded-2xl opacity-50 cursor-not-allowed select-none">
      <div className={`w-14 h-14 ${logoBg} border rounded-xl flex items-center justify-center flex-shrink-0`}>
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base font-semibold text-gray-700">{name}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-gray-400 leading-snug">{description}</p>
        <div className="flex gap-2 mt-2">
          {tags.map((t) => (
            <Tag key={t} muted>{t}</Tag>
          ))}
        </div>
      </div>
    </div>
  )
}

function Tag({ children, muted }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        muted ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {children}
    </span>
  )
}

/* ── Brand logos (inline SVG) ── */

function AwsLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <path
        d="M13.8 25.2c0 .6.1 1.1.2 1.5.1.4.3.8.5 1.2.1.1.1.3.1.4 0 .2-.1.3-.3.5l-1 .6a.8.8 0 01-.4.1c-.2 0-.3-.1-.5-.2-.2-.3-.5-.6-.7-.9-.2-.3-.4-.7-.5-1-1.2 1.4-2.8 2.1-4.6 2.1-1.3 0-2.4-.4-3.1-1.1-.8-.7-1.1-1.7-1.1-3 0-1.3.5-2.4 1.4-3.2 1-.8 2.3-1.2 3.8-1.2.5 0 1.1.1 1.7.1.6.1 1.2.2 1.8.4v-1.1c0-1.2-.2-2-.7-2.4-.5-.5-1.3-.7-2.5-.7-.5 0-1.1.1-1.7.2-.6.1-1.2.3-1.7.5-.3.1-.5.2-.6.2h-.3c-.2 0-.3-.2-.3-.5v-.8c0-.3 0-.4.1-.5.1-.1.2-.2.4-.3.5-.3 1.2-.5 2-.7.8-.2 1.6-.3 2.5-.3 1.9 0 3.3.4 4.1 1.3.8.9 1.3 2.2 1.3 4v5.2l-.1.1zm-6.3 2.4c.5 0 1.1-.1 1.7-.3.6-.2 1.1-.6 1.5-1.1.3-.3.4-.7.5-1.1.1-.4.1-.9.1-1.4v-.7a14 14 0 00-1.5-.3c-.5-.1-1-.1-1.5-.1-1.1 0-1.9.2-2.4.6-.5.4-.8 1-.8 1.8 0 .7.2 1.3.5 1.6.4.7 1.1 1 1.9 1zm12.7 1.7c-.3 0-.5 0-.6-.2-.1-.1-.2-.3-.3-.6L16 16.8c-.1-.3-.1-.5-.1-.6 0-.3.1-.4.4-.4h1.6c.3 0 .5 0 .6.2.1.1.2.3.3.6l2.1 8.2 1.9-8.2c.1-.3.2-.5.3-.6.1-.1.3-.2.7-.2h1.3c.3 0 .5 0 .7.2.1.1.2.3.3.6l2 8.3 2.1-8.3c.1-.3.2-.5.3-.6.1-.1.3-.2.6-.2h1.5c.3 0 .4.1.4.4 0 .1 0 .2-.1.4 0 .1-.1.3-.2.5l-3.1 9.6c-.1.3-.2.5-.3.6-.1.1-.3.2-.6.2h-1.4c-.3 0-.5 0-.7-.2-.1-.1-.2-.3-.3-.6L24 19.3l-1.9 8c-.1.3-.2.5-.3.6-.1.1-.3.2-.7.2h-1zm16.4.4c-.8 0-1.7-.1-2.5-.3-.8-.2-1.4-.5-1.8-.7-.3-.2-.4-.3-.5-.4-.1-.1-.1-.3-.1-.5v-.8c0-.3.1-.5.4-.5.1 0 .2 0 .3.1.1 0 .2.1.4.2.5.3 1.1.5 1.8.6.7.1 1.3.2 2 .2 1.1 0 1.9-.2 2.4-.6.6-.4.8-.9.8-1.6 0-.5-.1-.9-.4-1.2-.3-.3-.8-.6-1.5-.9l-2.1-.6c-1.1-.3-1.8-.8-2.3-1.5-.5-.6-.7-1.3-.7-2.1 0-.6.1-1.1.4-1.6.3-.5.6-.9 1.1-1.2.5-.3 1-.6 1.6-.8.6-.2 1.3-.2 2-.2.4 0 .7 0 1.1.1.4.1.7.1 1.1.2.3.1.6.2.9.3.3.1.5.2.7.3.2.1.3.2.4.4.1.1.1.3.1.5v.7c0 .3-.1.5-.4.5-.1 0-.3-.1-.6-.2-.8-.4-1.7-.6-2.7-.6-.9 0-1.7.1-2.2.5-.5.3-.7.8-.7 1.4 0 .5.2.9.5 1.2.3.3.9.6 1.7.9l2 .6c1 .3 1.8.8 2.2 1.4.5.6.7 1.3.7 2 0 .6-.1 1.2-.4 1.7-.3.5-.6 1-1.1 1.3-.5.4-1 .6-1.7.8-.7.3-1.5.4-2.2.4z"
        fill="#F90"
      />
      <path
        d="M35 32.7c-4 3-9.9 4.5-14.9 4.5-7.1 0-13.4-2.6-18.2-7 -.4-.3 0-.8.4-.5 5.2 3 11.6 4.8 18.2 4.8 4.5 0 9.4-.9 13.9-2.8.7-.2 1.2.5.6.9v.1z"
        fill="#F90"
      />
      <path
        d="M36.7 30.8c-.5-.6-3.3-.3-4.5-.2-.4 0-.4-.3-.1-.5 2.2-1.6 5.9-1.1 6.3-.6.4.5-.1 4.2-2.2 5.9-.3.3-.6.1-.5-.2.5-1.2 1.5-3.8 1-4.4z"
        fill="#F90"
      />
    </svg>
  )
}

function AzureLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <path d="M20 8l-12 22h9l11-14L20 8z" fill="#0078D4" opacity=".7" />
      <path d="M28 16l-8 14 18 0L28 16z" fill="#0078D4" />
    </svg>
  )
}

function GcpLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <path d="M30 14H18l-8 14 8 14h12l8-14-8-14z" fill="#EA4335" opacity=".2" />
      <path d="M24 10c-7.7 0-14 6.3-14 14s6.3 14 14 14 14-6.3 14-14-6.3-14-14-14zm0 4a10 10 0 110 20 10 10 0 010-20z" fill="#4285F4" opacity=".6" />
    </svg>
  )
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
