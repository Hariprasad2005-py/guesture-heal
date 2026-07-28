import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertCircle, Loader2, Activity } from 'lucide-react'
import { useAppStore } from '../store/appStore'

const STEPS = [
  { id: 'baseline', label: 'Hold hand open and still', description: 'Establishing baseline hand size...' },
  { id: 'fist', label: 'Make a tight fist', description: 'Setting closed-hand threshold...' },
  { id: 'swipe', label: 'Swipe right slowly', description: 'Calibrating movement velocity...' },
  { id: 'range', label: 'Raise arm as high as possible', description: 'Measuring maximum reach...' },
]

export default function CalibrationScreen({ onComplete, landmarks, gesture, swipeData, stats }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [calibrationData, setCalibrationData] = useState({})
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const setGameCalibration = useAppStore(state => state.setGameCalibration)

  const step = STEPS[currentStep]

  useEffect(() => {
    let diagTimer
    if (!landmarks) {
      diagTimer = setTimeout(() => setShowDiagnostic(true), 3000)
    } else {
      setShowDiagnostic(false)
    }
    return () => clearTimeout(diagTimer)
  }, [landmarks])

  const isGestureCorrect = useCallback(() => {
    if (!landmarks || landmarks.length === 0) return false
    if (step.id === 'baseline') return gesture === 'open_hand'
    if (step.id === 'fist') return gesture === 'fist'
    if (step.id === 'swipe') return true
    if (step.id === 'range') return true
    return false
  }, [landmarks, gesture, step])

  useEffect(() => {
    let timer
    const correct = isGestureCorrect()
    
    if (correct) {
      timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(timer)
            handleStepComplete()
            return 100
          }
          return prev + 2
        })
      }, 100)
    } else {
      const drain = setInterval(() => {
        setProgress(prev => Math.max(0, prev - 2))
      }, 100)
      return () => clearInterval(drain)
    }
    return () => clearInterval(timer)
  }, [landmarks, gesture, currentStep, isGestureCorrect])

  const handleStepComplete = useCallback(() => {
    const stepId = STEPS[currentStep].id
    let data = {}

    if (landmarks && landmarks.length > 0) {
      const lm = landmarks[0]
      if (stepId === 'baseline') {
        const dist = Math.sqrt(Math.pow(lm[0].x - lm[9].x, 2) + Math.pow(lm[0].y - lm[9].y, 2))
        data = { handScale: dist }
      } else if (stepId === 'fist') {
        data = { isFist: gesture === 'fist' }
      } else if (stepId === 'swipe') {
        data = { baseVelocity: swipeData.velocity }
      } else if (stepId === 'range') {
        data = { maxReach: 1 - lm[0].y }
      }
    }

    setCalibrationData(prev => {
      const newData = { ...prev, [stepId]: data }
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(prev => prev + 1)
        setProgress(0)
        return newData
      } else {
        const finalData = { ...newData, timestamp: Date.now() }
        setGameCalibration(finalData)
        onComplete(finalData)
        return finalData
      }
    })
  }, [currentStep, landmarks, gesture, swipeData, setGameCalibration, onComplete])

  return (
    <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center z-50 text-white p-8">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Loader2 className="animate-spin text-teal-400" />
          Pre-Session Calibration
        </h2>

        <div className="space-y-6">
          {STEPS.map((step, idx) => (
            <div 
              key={step.id} 
              className={`flex items-start gap-4 transition-opacity ${idx === currentStep ? 'opacity-100' : 'opacity-40'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                idx < currentStep ? 'bg-teal-500' : idx === currentStep ? 'bg-teal-600' : 'bg-slate-700'
              }`}>
                {idx < currentStep ? <CheckCircle size={20} /> : idx + 1}
              </div>
              <div>
                <h3 className="font-semibold">{step.label}</h3>
                {idx === currentStep && (
                  <p className="text-sm text-slate-400 mt-1">{step.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 relative h-48 bg-slate-900 rounded-3xl flex items-center justify-center overflow-hidden border border-slate-700">
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
             <GhostHand stepId={step.id} />
          </div>
          <div className="text-center z-10">
            <div className={`text-sm font-black uppercase tracking-widest mb-2 ${isGestureCorrect() ? 'text-teal-400' : 'text-slate-500'}`}>
              {isGestureCorrect() ? 'Position Correct - Stay Still' : 'Match the guide position'}
            </div>
            <div className="h-3 w-64 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div 
                className="h-full bg-teal-500 transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {!landmarks && (
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-400/10 p-4 rounded-xl border border-amber-400/20">
              <AlertCircle size={20} className="flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold">Hand not detected!</span>
                <span className="opacity-80">Move slightly back and lift your hand higher.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const GhostHand = ({ stepId }) => {
  if (stepId === 'baseline') return (
    <svg width="80" height="100" viewBox="0 0 80 100" fill="currentColor">
      <rect x="30" y="60" width="20" height="40" rx="10" />
      <rect x="10" y="30" width="12" height="40" rx="6" />
      <rect x="25" y="10" width="12" height="50" rx="6" />
      <rect x="40" y="5" width="12" height="55" rx="6" />
      <rect x="55" y="15" width="12" height="45" rx="6" />
      <rect x="70" y="35" width="12" height="35" rx="6" />
    </svg>
  )
  if (stepId === 'fist') return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="currentColor">
      <rect x="10" y="20" width="60" height="50" rx="15" />
      <rect x="15" y="10" width="15" height="30" rx="7" />
      <rect x="32" y="10" width="15" height="30" rx="7" />
      <rect x="49" y="10" width="15" height="30" rx="7" />
    </svg>
  )
  return null
}