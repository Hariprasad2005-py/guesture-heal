// Exercise definitions with MediaPipe pose landmarks for ROM measurement
export const EXERCISES = {
  shoulder_flexion: {
    id: 'shoulder_flexion',
    name: 'Shoulder Flexion',
    description: 'Raise your arm forward to the target angle',
    targetROM: 120,
    landmarks: ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_HIP'],
    joint: 'shoulder',
    side: 'left',
    category: 'upper_limb',
    duration: 30,
    targetReps: 10,
    cues: ['Keep your elbow straight', 'Raise slowly and controlled', 'Lower back down gently'],
    difficulty: 1,
  },
  shoulder_abduction: {
    id: 'shoulder_abduction',
    name: 'Shoulder Abduction',
    description: 'Raise your arm sideways to the target angle',
    targetROM: 90,
    landmarks: ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_HIP'],
    joint: 'shoulder',
    side: 'left',
    category: 'upper_limb',
    duration: 30,
    targetReps: 10,
    cues: ['Keep arm level with shoulder', 'Avoid shrugging', 'Controlled movement'],
    difficulty: 1,
  },
  elbow_flexion: {
    id: 'elbow_flexion',
    name: 'Elbow Flexion',
    description: 'Bend your elbow to curl your forearm up',
    targetROM: 130,
    landmarks: ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_WRIST'],
    joint: 'elbow',
    side: 'left',
    category: 'upper_limb',
    duration: 30,
    targetReps: 12,
    cues: ['Keep upper arm still', 'Full range of motion', 'Squeeze at the top'],
    difficulty: 1,
  },
  knee_extension: {
    id: 'knee_extension',
    name: 'Knee Extension',
    description: 'Straighten your leg from seated position',
    targetROM: 90,
    landmarks: ['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'],
    joint: 'knee',
    side: 'left',
    category: 'lower_limb',
    duration: 30,
    targetReps: 10,
    cues: ['Keep back straight', 'Lift slowly', 'Hold at top briefly'],
    difficulty: 1,
  },
  hip_flexion: {
    id: 'hip_flexion',
    name: 'Hip Flexion',
    description: 'Raise your knee toward your chest while standing',
    targetROM: 80,
    landmarks: ['LEFT_SHOULDER', 'LEFT_HIP', 'LEFT_KNEE'],
    joint: 'hip',
    side: 'left',
    category: 'lower_limb',
    duration: 30,
    targetReps: 10,
    cues: ['Hold support if needed', 'Controlled lift', 'Balance on standing leg'],
    difficulty: 2,
  },
  wrist_extension: {
    id: 'wrist_extension',
    name: 'Wrist Extension',
    description: 'Extend your wrist back as far as comfortable',
    targetROM: 60,
    landmarks: ['LEFT_ELBOW', 'LEFT_WRIST', 'LEFT_INDEX'],
    joint: 'wrist',
    side: 'left',
    category: 'upper_limb',
    duration: 25,
    targetReps: 15,
    cues: ['Keep forearm flat', 'Gentle pressure only', 'No pain allowed'],
    difficulty: 1,
  },
  neck_rotation: {
    id: 'neck_rotation',
    name: 'Neck Rotation',
    description: 'Slowly rotate your head to each side',
    targetROM: 60,
    landmarks: ['LEFT_EAR', 'LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    joint: 'neck',
    side: 'both',
    category: 'cervical',
    duration: 20,
    targetReps: 8,
    cues: ['Very slow movement', 'No pain', 'Breathe through motion'],
    difficulty: 1,
  },
}

export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
}

export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return 0
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)
  let angle = Math.abs((radians * 180.0) / Math.PI)
  if (angle > 180) angle = 360 - angle
  return Math.round(angle)
}

export function calculateScore(reps, accuracy, combo, timeBonus) {
  const base = reps * 100
  const accuracyBonus = Math.round(accuracy * reps * 50)
  const comboBonus = combo > 2 ? combo * 75 : 0
  return base + accuracyBonus + comboBonus + timeBonus
}

export const LEVEL_THRESHOLDS = [0, 500, 1200, 2500, 4500, 7000, 10000]
export function getLevel(score) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}

export function getGrade(accuracy) {
  if (accuracy >= 90) return { grade: 'A+', color: 'text-emerald-600' }
  if (accuracy >= 80) return { grade: 'A', color: 'text-emerald-500' }
  if (accuracy >= 70) return { grade: 'B', color: 'text-blue-600' }
  if (accuracy >= 60) return { grade: 'C', color: 'text-amber-600' }
  return { grade: 'D', color: 'text-red-500' }
}

export const PAIN_LABELS = {
  0: { label: 'No Pain', color: '#10b981' },
  1: { label: 'Very Mild', color: '#34d399' },
  2: { label: 'Mild', color: '#6ee7b7' },
  3: { label: 'Noticeable', color: '#fbbf24' },
  4: { label: 'Moderate', color: '#f59e0b' },
  5: { label: 'Moderate-Severe', color: '#f97316' },
  6: { label: 'Moderately Severe', color: '#ea580c' },
  7: { label: 'Severe', color: '#ef4444' },
  8: { label: 'Very Severe', color: '#dc2626' },
  9: { label: 'Extremely Severe', color: '#b91c1c' },
  10: { label: 'Worst Possible', color: '#7f1d1d' },
}

export const CONDITIONS = [
  { value: 'stroke', label: 'Stroke Recovery' },
  { value: 'injury', label: 'Sports/Trauma Injury' },
  { value: 'surgery', label: 'Post-Surgery Rehabilitation' },
  { value: 'neurological', label: 'Neurological Disorder' },
  { value: 'other', label: 'Other Condition' },
]

export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5, INDEX_FINGER_PIP: 6, INDEX_FINGER_DIP: 7, INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9, MIDDLE_FINGER_PIP: 10, MIDDLE_FINGER_DIP: 11, MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13, RING_FINGER_PIP: 14, RING_FINGER_DIP: 15, RING_FINGER_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
}

export const GAME_EXERCISE_MAP = {
  rehab_slicer: {
    id: 'rehab_slicer',
    name: 'Rehab Slicer',
    description: 'Slice medical items with hand swipes. Improves wrist and shoulder mobility.',
    exercises: ['shoulder_flexion', 'wrist_extension'],
    targetGestures: ['swipe_right', 'swipe_left'],
    color: 'teal',
    icon: 'Sword'
  },
  precision_reach: {
    id: 'precision_reach',
    name: 'Precision Reach',
    description: 'Hold targets at specific angles. Improves shoulder range of motion.',
    exercises: ['shoulder_flexion', 'shoulder_abduction'],
    targetGestures: ['open_hand', 'hold'],
    color: 'blue',
    icon: 'Target'
  },
  cloud_reach: {
    id: 'cloud_reach',
    name: 'Cloud Reach',
    description: 'Pop floating balloons at random positions. Improves arm elevation.',
    exercises: ['shoulder_abduction', 'shoulder_flexion'],
    targetGestures: ['open_hand'],
    color: 'amber',
    icon: 'Cloud'
  },
  catch_flex: {
    id: 'catch_flex',
    name: 'Catch & Flex',
    description: 'Catch falling items with a basket. Improves elbow flexion and coordination.',
    exercises: ['elbow_flexion', 'shoulder_abduction'],
    targetGestures: ['open_hand', 'fist'],
    color: 'red',
    icon: 'ShoppingBasket'
  },
  canvas_air: {
    id: 'canvas_air',
    name: 'Canvas Air',
    description: 'Draw shapes in the air with your finger. Improves fine motor skills and wrist rotation.',
    exercises: ['wrist_extension', 'elbow_flexion'],
    targetGestures: ['point'],
    color: 'indigo',
    icon: 'Palette'
  },
}

export const REHAB_GOALS = [
  'Restore range of motion',
  'Reduce pain',
  'Improve strength',
  'Improve coordination',
  'Regain independence in daily activities',
  'Improve balance and stability',
  'Return to sports / physical activity',
]