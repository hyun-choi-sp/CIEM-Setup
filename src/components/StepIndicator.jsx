const STEPS = ['Login', 'Select Connector', 'Configure Source', 'Result']

export default function StepIndicator({ currentStep }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-start">
        {STEPS.map((label, index) => {
          const stepNum = index + 1
          const isCompleted = stepNum < currentStep
          const isActive = stepNum === currentStep
          const isLast = index === STEPS.length - 1

          return (
            <li key={stepNum} className={`flex items-center ${!isLast ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1.5">
                {/* Circle */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300 ${
                    isCompleted
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : isActive
                      ? 'bg-white border-blue-600 text-blue-700 shadow-sm shadow-blue-100'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}
                >
                  {isCompleted ? <CheckIcon /> : stepNum}
                </div>
                {/* Label */}
                <span
                  className={`text-xs font-medium whitespace-nowrap leading-none ${
                    isActive
                      ? 'text-blue-700'
                      : isCompleted
                      ? 'text-gray-600'
                      : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-6 transition-colors duration-300 ${
                    isCompleted ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
