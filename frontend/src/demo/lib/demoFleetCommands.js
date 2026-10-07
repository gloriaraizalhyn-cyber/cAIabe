import { supabase } from "../../shared/lib/supabaseClient.js";

// The passenger demo's "fast-forward". The jeeps on every pane are real
// simulated units run by mock-fleet-simulator.js, so the only way to speed one
// up is to ask that process — through the demo_commands table it already
// polls. demo_commands only accepts a fixed list of command types, so this
// reuses "resume" and carries the speed in its payload (the simulator reads
// `multiplier` and `capacity` from it — see applyDemoAction).
//
// `target` matches a unit's driver id OR any part of its label, and the label
// contains the route name — so a route name speeds up every unit on that
// route, while a driver id speeds up just that one.

export const DEMO_SPEED_OPTIONS = [1, 4, 8];
const DEFAULT_DEMO_SPEED = 8;

// Kept at module level so the chosen speed survives the passenger pane moving
// between pages (waiting -> riding -> transfer -> waiting ...).
let currentDemoSpeed = DEFAULT_DEMO_SPEED;

export function getDemoSpeed() {
  return currentDemoSpeed;
}

export function setDemoSpeed(speed) {
  currentDemoSpeed = speed;
}

export function nextDemoSpeed(speed) {
  const index = DEMO_SPEED_OPTIONS.indexOf(speed);
  return DEMO_SPEED_OPTIONS[(index + 1) % DEMO_SPEED_OPTIONS.length];
}

// speed 1 = real time, 8 = eight times faster. `openSeats` also pins the
// units' seats open so the jeep she is waiting for can actually pick her up;
// the pin is cleared by the next command without it.
export async function sendFleetSpeed(target, speed, { openSeats = false } = {}) {
  if (!target) return;
  const { error } = await supabase.from("demo_commands").insert({
    type: "resume",
    payload: {
      target,
      multiplier: 1 / Math.max(1, speed),
      ...(openSeats ? { capacity: "available" } : {}),
    },
  });
  if (error) console.warn("demo fleet command failed:", error.message);
}
