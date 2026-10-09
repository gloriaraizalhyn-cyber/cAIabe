// The stage's line to its own driver panes.
//
// A pane driver that is driving is moved by its OWN page — DrivingPage's demo
// drive loop, running inside the iframe — not by mock-fleet-simulator.js. The
// simulator can't idle or slow a unit it doesn't hold the session for, so
// presenter levers aimed at a pane driver have to reach the page itself.
// The stage and its iframes share an origin, so a BroadcastChannel does that
// with no server round trip.
//
// Messages:
//   pane → stage  { kind: "drive-presence", slot, driverId, isDriving, mode }
//                 sent every few seconds while driving, and once on stop
//   stage → pane  { kind: "lever", slot, action: "idle"|"slow"|"resume", id }
//   pane → stage  { kind: "lever-ack", slot, id, mode }
//   stage → panes { kind: "time-scale", scale }   the presenter's fast-forward
//   pane → stage  { kind: "time-scale-request" }  a pane that just loaded
//
// `mode` is what the pane's drive loop is actually doing right now:
// "normal" | "idle" | "slow".

import { useEffect, useState } from "react";

const CHANNEL_NAME = "caiabe-demo-stage";

// Which stage pane slot this page is ("grey" | "yellow" | null). Captured at
// module load for the same reason as DEMO_FRAME in demoTripParams.js: in-app
// navigation drops the query string while the iframe keeps living.
const DEMO_SLOT =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("demoSlot") : null;

export function getDemoSlot() {
  return DEMO_SLOT;
}

let channel = null;

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function postToDemoStage(message) {
  getChannel()?.postMessage(message);
}

// Returns an unsubscribe function.
export function listenToDemoStage(handler) {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMessage = (event) => handler(event.data ?? {});
  ch.addEventListener("message", onMessage);
  return () => ch.removeEventListener("message", onMessage);
}

// The stage's fast-forward, as seen from inside a pane: 1 is real time. Kept
// at module level so it survives the pane moving between pages.
let currentTimeScale = 1;

export function useDemoTimeScale(isEnabled) {
  const [scale, setScale] = useState(isEnabled ? currentTimeScale : 1);

  useEffect(() => {
    if (!isEnabled) return undefined;
    const unsubscribe = listenToDemoStage((message) => {
      if (message.kind !== "time-scale") return;
      const next = Number(message.scale) > 0 ? Number(message.scale) : 1;
      currentTimeScale = next;
      setScale(next);
    });
    postToDemoStage({ kind: "time-scale-request" });
    return unsubscribe;
  }, [isEnabled]);

  return isEnabled ? scale : 1;
}

// Sends a lever to one pane and resolves with the mode the pane reports after
// applying it, or null if no pane answered in time (not driving, or closed).
export function sendPaneLever(slot, action, { timeoutMs = 2500 } = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);
    const unsubscribe = listenToDemoStage((message) => {
      if (message.kind !== "lever-ack" || message.id !== id) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(message.mode ?? null);
    });
    postToDemoStage({ kind: "lever", slot, action, id });
  });
}
