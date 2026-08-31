import { useEffect, useRef, useState } from "react";
import { haversineDistanceMeters } from "../../shared/utils/geo.js";

// How close to the anchor a reading has to stay to NOT count as movement.
const STATIONARY_THRESHOLD_METERS = 10;
// Consecutive out-of-threshold readings required before we trust the driver
// actually moved and reset the timer — guards against a single noisy GPS
// spike (routine under overpasses/tree cover, exactly the roadside
// conditions this feature targets) wiping out a multi-minute idle timer.
const STATIONARY_CONFIRM_STREAK = 2;
// Matches DriverDashboardPage's existing terminal-arrival radius — being
// this close to the terminal is never roadside idling, full stop.
const TERMINAL_EXCLUSION_RADIUS_METERS = 150;
// Bands MUST stay in sync with driver-demand-check/index.ts's own copy of
// these same numbers — no shared-import boundary exists between the Vite
// frontend and Deno edge functions, so this duplication is deliberate. Only
// used here for the (cosmetic) map badge — the actual card copy/severity
// always comes from the server response, which is the source of truth.
const ROADSIDE_MONITOR_MINUTES = 2;
const ROADSIDE_WARNING_MINUTES = 5;
const ROADSIDE_PROLONGED_MINUTES = 10;
const TICK_INTERVAL_MS = 1000;

function classifyIdleStatus(minutes) {
  if (minutes === null || minutes < ROADSIDE_MONITOR_MINUTES) return "none";
  if (minutes < ROADSIDE_WARNING_MINUTES) return "monitoring";
  if (minutes < ROADSIDE_PROLONGED_MINUTES) return "idling";
  return "prolonged";
}

// Detects "stopped on the roadside, not at the terminal" for Sak.AI's
// roadside-idling feature — reuses the SAME position stream DrivingPage.jsx
// already produces via its own GPS watch; this hook never touches
// navigator.geolocation itself. Only tracks/ticks a local timer; the actual
// verdict (headline, fuel estimate, whether this counts as a problem) comes
// from driver-demand-check server-side (see DrivingPage.jsx, which reports
// this hook's minutes back to useDriverDemand).
export function useRoadsideIdleTracker({ position, terminalPosition, isActive }) {
  const [isNearTerminal, setIsNearTerminal] = useState(false);
  const [isStationary, setIsStationary] = useState(false);
  const [roadsideIdleMinutes, setRoadsideIdleMinutes] = useState(0);
  const [idleStatus, setIdleStatus] = useState("none");

  const anchorRef = useRef(null);
  const outOfRangeStreakRef = useRef(0);
  const stationarySinceRef = useRef(null);

  const resetAll = () => {
    anchorRef.current = null;
    outOfRangeStreakRef.current = 0;
    stationarySinceRef.current = null;
    setIsStationary(false);
    setRoadsideIdleMinutes(0);
    setIdleStatus("none");
  };

  // Effect A: consume each new position, maintain the anchor/hysteresis.
  useEffect(() => {
    if (!isActive || !position) {
      resetAll();
      setIsNearTerminal(false);
      return;
    }

    const nearTerminal = terminalPosition
      ? haversineDistanceMeters(position, terminalPosition) <= TERMINAL_EXCLUSION_RADIUS_METERS
      : false;

    // Crossing the terminal boundary (either direction) fully resets the
    // clock — idle time never carries across it, in either direction.
    if (nearTerminal !== isNearTerminal) {
      resetAll();
      setIsNearTerminal(nearTerminal);
    }
    if (nearTerminal) return;

    if (!anchorRef.current) {
      anchorRef.current = position;
      stationarySinceRef.current = Date.now();
      setIsStationary(true);
      return;
    }

    const distance = haversineDistanceMeters(anchorRef.current, position);
    if (distance <= STATIONARY_THRESHOLD_METERS) {
      outOfRangeStreakRef.current = 0;
      return;
    }

    outOfRangeStreakRef.current += 1;
    if (outOfRangeStreakRef.current >= STATIONARY_CONFIRM_STREAK) {
      anchorRef.current = position;
      outOfRangeStreakRef.current = 0;
      stationarySinceRef.current = Date.now();
      setRoadsideIdleMinutes(0);
      setIdleStatus("none");
      // still stationary at the new anchor, just restarting the clock
      setIsStationary(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, terminalPosition, isActive]);

  // Effect B: tick the live minutes/status display while active + stationary
  // + outside the terminal. Reads refs, not state, so it doesn't restart on
  // every GPS update.
  useEffect(() => {
    if (!isActive) return undefined;

    const tick = () => {
      if (!stationarySinceRef.current) return;
      const minutes = (Date.now() - stationarySinceRef.current) / 60000;
      setRoadsideIdleMinutes(minutes);
      setIdleStatus(classifyIdleStatus(minutes));
    };

    tick();
    const intervalId = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isActive]);

  return { roadsideIdleMinutes, idleStatus, isStationary, isNearTerminal };
}
