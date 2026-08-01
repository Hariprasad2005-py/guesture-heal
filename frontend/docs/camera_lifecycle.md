Camera lifecycle and landmark sources

Overview

This project uses MediaPipe models (Hands and Pose) via the in-repo hooks:
- `frontend/src/hooks/useMediaPipeUpperBody.js` — MediaPipe Hands
- `frontend/src/hooks/usePoseDetection.js` — MediaPipe Pose

Key points

1. Camera initialization
- The hooks rely on MediaPipe's own `Camera` utility (window.Camera) to call `getUserMedia()` and drive frame-by-frame `send({ image: video })` to the corresponding `Pose`/`Hands` instance.
- The hooks return a `videoRef` that callers attach to a `<video>` element. Do NOT call `navigator.mediaDevices.getUserMedia()` on the same `<video>` element — calling getUserMedia twice on the same element can hang.

2. Open / Close behavior
- Camera starts when the hook's `enabled` option is true and the hook finishes model setup (it calls `camera.start()` inside setup).
- Cleanup / close occurs in the hook's effect cleanup: `camera.stop()` (if present), `hands.close()` / `pose.close()`, and stopping `videoRef.current.srcObject` tracks.
- Therefore, open/close is fully controlled by the `enabled` flag passed to the hook.

3. Where landmarks come from
- Hands: `results.multiHandLandmarks` (normalized coordinates x/y in [0,1]); `useMediaPipeHands` exposes `landmarks`, `gesture`, and `handedness`. The hook also provides `getLandmark(idx)` for convenience.
- Pose: `results.poseLandmarks` which `useMediaPipePose.extractKeypoints` maps to pixel coordinates (x,y relative to the video) and returns named keypoints (leftShoulder, leftWrist, etc.). The hook exposes both raw `landmarks` and the `keypoints` mapping.

4. Gesture & swipe detection
- `useMediaPipeHands.detectGesture(lm)` returns simple categorical gestures (open, fist, point, peace, thumbs_up, pinch).
- `useMediaPipeHands.detectSwipe(prevPos, currPos, dt)` measures wrist displacement to detect left/right/up/down swipes when velocity exceeds thresholds.

5. Recommended usage for games
- Reuse the existing hooks — attach the returned `videoRef` to a single `<video>` per game view. Use the `enabled` flag so the camera only runs while the session is active (start/pause/end semantics).
- For high-performance games, pass `silent: true` to the hands/pose hooks and read data via the `onHandsUpdate` / `onPoseUpdate` callback into a `ref` to avoid per-frame React re-renders.
- Convert normalized hand landmarks to container pixels before using them for UI/collision checks. Example: fingertip px = { x: (1 - tip.x) * width, y: tip.y * height } for mirrored video.

6. Common gotchas
- Do not instantiate multiple MediaPipe pipelines for the same video element — ensure `enabled` guards and hook cleanup are respected.
- React StrictMode may mount/unmount hooks twice in development; the hooks handle cancellation guards to prevent duplicate camera instances.

Files
- `frontend/src/hooks/useMediaPipeUpperBody.js`
- `frontend/src/hooks/usePoseDetection.js`

If you'd like, I can add a short README snippet showing an example of how to attach `videoRef` and convert an index fingertip to container coordinates.