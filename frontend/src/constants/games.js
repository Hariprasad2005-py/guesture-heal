// frontend/src/constants/games.js
export const GAME_IDS = {
  REHAB_SLICER: 'rehab-slicer',
  PRECISION_REACH: 'precision-reach',
  CATCH_FLEX: 'catch-flex',
  CANVAS_AIR: 'canvas-air',
  CLOUD_REACH: 'cloud-reach',
};

export const GAME_TYPE_MAP = {
  'rehab-slicer': 'rehab_slicer',
  'precision-reach': 'precision_reach',
  'catch-flex': 'catch_flex',
  'canvas-air': 'canvas_air',
  'cloud-reach': 'cloud_reach',
};

export const GAME_DISPLAY_NAMES = {
  'rehab-slicer': 'Rehab Slicer',
  'precision-reach': 'Precision Reach',
  'catch-flex': 'Catch & Flex',
  'canvas-air': 'Canvas Air',
  'cloud-reach': 'Cloud Reach',
};

export const GAME_ICONS = {
  'rehab-slicer': 'Sword',
  'precision-reach': 'Target',
  'catch-flex': 'ShoppingBasket',
  'canvas-air': 'Palette',
  'cloud-reach': 'Cloud',
};

export const GAME_COLORS = {
  'rehab-slicer': { bg: 'bg-pink-50', text: 'text-pink-600' },
  'precision-reach': { bg: 'bg-blue-50', text: 'text-blue-600' },
  'catch-flex': { bg: 'bg-purple-50', text: 'text-purple-600' },
  'canvas-air': { bg: 'bg-rose-50', text: 'text-rose-600' },
  'cloud-reach': { bg: 'bg-cyan-50', text: 'text-cyan-600' },
};

export const GAME_DESCRIPTIONS = {
  'rehab-slicer': 'Slice falling items one at a time to build wrist and elbow motion.',
  'precision-reach': 'Raise your arm to launch a rocket higher and improve shoulder reach.',
  'catch-flex': 'Move your hand to steer the basket and catch falling fruit.',
  'canvas-air': 'Trace shapes with your fingertip to improve fine motor control.',
  'cloud-reach': 'Reach and pop clouds to improve shoulder elevation and arm strength.',
};