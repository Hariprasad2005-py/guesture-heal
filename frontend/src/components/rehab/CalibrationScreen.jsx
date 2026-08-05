
import React, { useState } from 'react';

const STEPS = [
  {
    id: 'face',
    title: 'Neutral Face Calibration',
    instruction: 'Relax your face and look at the camera. Hold a neutral, relaxed expression.',
    icon: '??',
    durationLabel: '4 seconds',
  },
  {
    id: 'pose',
    title: 'Resting Arm Calibration',
    instruction: 'Sit or stand upright with both arms relaxed at your sides, facing the camera.',
    icon: '??',
    durationLabel: '2 seconds',
  },
];

export default function CalibrationScreen({ onCalibrateFace, onCalibratePose, onComplete, faceDetected, bodyDetected }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const step = STEPS[stepIndex];
  const canRun = step.id === 'face' ? faceDetected : bodyDetected;

  const runStep = async () => {
    setRunning(true);
    if (step.id === 'face') {
      await onCalibrateFace();
    } else {
      await onCalibratePose();
    }
    setRunning(false);
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-slate-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 p-6 sm:p-8 text-center">
        <div className="text-5xl mb-3">{step.icon}</div>
        <h2 className="text-xl font-bold text-white mb-1">{step.title}</h2>
        <p className="text-slate-400 text-sm mb-2">{step.instruction}</p>
        <p className="text-slate-500 text-xs mb-6">Takes about {step.durationLabel}. Step {stepIndex + 1} of {STEPS.length}.</p>

        {!canRun && !running && (
          <div className="mb-4 text-amber-400 text-sm font-medium">
            {step.id === 'face' ? 'Position your face in view of the camera' : 'Step back so your upper body is visible'}
          </div>
        )}

        <button
          onClick={runStep}
          disabled={!canRun || running}
          className="w-full px-6 py-4 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl font-bold text-white text-lg transition"
        >
          {running ? 'Calibrating' : `Start ${step.title}`}
        </button>
      </div>
    </div>
  );
}


