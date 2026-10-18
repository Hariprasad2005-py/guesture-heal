// Warms the browser cache with the hand-tracking files so a game starts
// faster. Safe to call many times; it only downloads once per page load and
// never throws. The URLs match useMediaPipeUpperBody.js.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const FILES = [
  MODEL_URL,
  `${WASM_BASE}/vision_wasm_internal.js`,
  `${WASM_BASE}/vision_wasm_internal.wasm`,
];

let started = false;

export function preloadPoseAssets() {
  if (started || typeof fetch !== "function") return;
  started = true;
  for (const url of FILES) {
    try {
      fetch(url, { cache: "force-cache", mode: "cors" })
        .then((r) => r.arrayBuffer())
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }
  // also load the JS side of the library ahead of time
  import("@mediapipe/tasks-vision").catch(() => {});
}
