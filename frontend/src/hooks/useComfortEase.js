// Eases a game down when the patient looks uncomfortable, and brings it back
// up when they have been comfortable for a while.
//  - "uncomfortable" = the face-based pain score (PAPS, 0-10) is 5 or more,
//    or the pain detector fired, for 3 seconds in a row
//  - each time that happens the game goes down ONE level (at most 2 levels)
//  - after 30 calm seconds it comes back up one level
// The game keeps counting its normal level; it just subtracts easeSteps.
import { useEffect, useRef, useState } from "react";

const PAPS_LIMIT = 5;
const UNCOMFORTABLE_SECONDS = 3;
const CALM_SECONDS = 30;
const MAX_EASE_STEPS = 2;

export default function useComfortEase({ papsScore = 0, isPainDetected = false, active = true } = {}) {
  const [easeSteps, setEaseSteps] = useState(0);
  const [notice, setNotice] = useState({ visible: false, text: "" });
  const uncomfortableRef = useRef(false);
  const easeRef = useRef(0);
  const ticksRef = useRef({ bad: 0, calm: 0 });
  const hideTimerRef = useRef(null);

  uncomfortableRef.current = !!isPainDetected || (papsScore || 0) >= PAPS_LIMIT;

  useEffect(() => {
    if (!active) return undefined;
    const show = (text) => {
      setNotice({ visible: true, text });
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setNotice((n) => ({ ...n, visible: false })), 3200);
    };
    const id = setInterval(() => {
      const t = ticksRef.current;
      if (uncomfortableRef.current) {
        t.bad += 1;
        t.calm = 0;
      } else {
        t.calm += 1;
        t.bad = 0;
      }
      if (t.bad >= UNCOMFORTABLE_SECONDS && easeRef.current < MAX_EASE_STEPS) {
        t.bad = 0;
        easeRef.current += 1;
        setEaseSteps(easeRef.current);
        show("Taking it a little easier");
      } else if (t.calm >= CALM_SECONDS && easeRef.current > 0) {
        t.calm = 0;
        easeRef.current -= 1;
        setEaseSteps(easeRef.current);
        show("Feeling good? Stepping back up");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    []
  );

  return { easeSteps, notice };
}
