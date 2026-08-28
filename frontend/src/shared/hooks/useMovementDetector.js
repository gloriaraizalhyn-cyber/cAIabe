import { useEffect, useRef, useState } from "react";

// Faster than a brisk walk (~1.4 m/s) but well within stop-and-go jeepney
// traffic — distinguishes "the jeep pulled away" from "still standing at
// the bay" without being fooled by someone walking quickly to catch it.
const MOVING_SPEED_THRESHOLD_MPS = 2.5;
// Consecutive fast-enough readings required before we trust it, so one
// noisy GPS jump (common while stationary) can't trigger this alone.
const MIN_FAST_STREAK = 3;
// Total displacement the streak must add up to — guards against GPS drift
// that technically "moves" a few meters per reading while standing still.
const MIN_TOTAL_DISTANCE_METERS = 20;
const MAX_HISTORY = 10;

function haversineDistanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Watches a stream of { lat, lng } positions and reports once the passenger
// has actually started riding — not just standing at the bay, whose GPS can
// drift a few meters entirely on its own. Pass `null` while detection
// shouldn't be running yet (e.g. before the passenger has committed to
// waiting for a specific jeep); the history resets whenever that happens so
// a later watch starts clean.
export function useMovementDetector(position) {
  const [hasStartedMoving, setHasStartedMoving] = useState(false);
  const historyRef = useRef([]);
  const fastStreakRef = useRef(0);

  useEffect(() => {
    if (!position) {
      historyRef.current = [];
      fastStreakRef.current = 0;
      return;
    }
    if (hasStartedMoving) return;

    const now = Date.now();
    const history = historyRef.current;
    const previous = history[history.length - 1];
    history.push({ ...position, timestamp: now });
    if (history.length > MAX_HISTORY) history.shift();

    if (!previous) return;

    const distance = haversineDistanceMeters(previous, position);
    const seconds = (now - previous.timestamp) / 1000;
    const speed = seconds > 0 ? distance / seconds : 0;

    fastStreakRef.current = speed >= MOVING_SPEED_THRESHOLD_MPS ? fastStreakRef.current + 1 : 0;

    const totalDistance =
      history.length > 1 ? haversineDistanceMeters(history[0], history[history.length - 1]) : 0;

    if (fastStreakRef.current >= MIN_FAST_STREAK && totalDistance >= MIN_TOTAL_DISTANCE_METERS) {
      setHasStartedMoving(true);
    }
  }, [position, hasStartedMoving]);

  return hasStartedMoving;
}
