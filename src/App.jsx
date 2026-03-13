import { useState } from 'react'
import StepIndicator from './components/StepIndicator'
import Step1Login from './components/Step1Login'
import Step2SelectConnector from './components/Step2SelectConnector'
import Step3ConfigureSource from './components/Step3ConfigureSource'
import Step3ConfigureSourceAzure from './components/Step3ConfigureSourceAzure'
import Step4Result from './components/Step4Result'

export default function App() {
  const [step, setStep] = useState(1)
  const [auth, setAuth] = useState(null)            // { tenant, token }
  const [connectorType, setConnectorType] = useState(null)
  const [sourceResult, setSourceResult] = useState(null)
  const [sourceConfig, setSourceConfig] = useState(null) // pre-fill on "go back"

  const handleLogin = (authData) => {
    setAuth(authData)
    setStep(2)
  }

  const handleSelectConnector = (type) => {
    setConnectorType(type)
    setStep(3)
  }

  const handleSourceResult = (result, config) => {
    setSourceResult(result)
    setSourceConfig(config)
    setStep(4)
  }

  const handleGoBack = () => {
    // Return to Step 3 with form pre-filled
    setStep(3)
  }

  const handleReset = () => {
    setStep(1)
    setAuth(null)
    setConnectorType(null)
    setSourceResult(null)
    setSourceConfig(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* App header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">SailPoint ISC</h1>
              <p className="text-xs text-gray-400 mt-0.5">CIEM Source Configurator</p>
            </div>
          </div>

          {/* Tenant badge — visible once logged in */}
          {auth?.tenant && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="font-mono font-medium text-gray-700">{auth.tenant}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Step progress indicator */}
        <div className="mb-10">
          <StepIndicator currentStep={step} />
        </div>

        {/* Step content */}
        {step === 1 && <Step1Login onLogin={handleLogin} />}

        {step === 2 && (
          <Step2SelectConnector onSelect={handleSelectConnector} auth={auth} />
        )}

        {step === 3 && connectorType === 'ciem-aws' && (
          <Step3ConfigureSource
            auth={auth}
            initialConfig={sourceConfig}
            onResult={handleSourceResult}
            onBack={() => setStep(2)}
          />
        )}

        {step === 3 && connectorType === 'ciem-azure' && (
          <Step3ConfigureSourceAzure
            auth={auth}
            initialConfig={sourceConfig}
            onResult={handleSourceResult}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <Step4Result
            result={sourceResult}
            onGoBack={handleGoBack}
            onReset={handleReset}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16 py-6 text-center text-xs text-gray-400">
        SailPoint ISC CIEM Source Configurator &mdash; Not an official SailPoint product.
      </footer>
    </div>
  )
}
