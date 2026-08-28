// Resolves texted place names (e.g. "JENRA Grand Mall") against the
// curated `landmarks` table (server-side mirror of the frontend's
// PLACE_SUGGESTIONS_FIXTURE — see add_landmarks.sql) for sms-webhook.
// Deliberately NOT backed by a geocoder: no auth on the SMS side means
// anyone who texts the number could otherwise run up API costs.

import { getServiceClient } from "./client.ts";

export interface Landmark {
  label: string;
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6371000;

// Exact label match first, then substring in either direction (handles
// both a shortened text like "Nepo" -> "Nepo Mall" and a padded one like
// "the JENRA Grand Mall please" -> "JENRA Grand Mall"). First match wins —
// the list is small and curated enough that ambiguity isn't a real risk.
export async function findLandmark(
  supabase: ReturnType<typeof getServiceClient>,
  text: string,
): Promise<Landmark | null> {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;

  const { data, error } = await supabase.from("landmarks").select("label, lat, lng");
  if (error || !data) return null;

  const exact = data.find((row) => row.label.toLowerCase() === needle);
  if (exact) return exact;

  const partial = data.find(
    (row) => needle.includes(row.label.toLowerCase()) || row.label.toLowerCase().includes(needle),
  );
  return partial ?? null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Labels a leg's boarding/alighting point for the directions reply. Route
// legs land at arbitrary points along a route's real polyline, not
// necessarily at a curated landmark — so this is "nearest known place
// within reason," falling back to a generic label rather than pretending
// precision we don't have.
export async function nearestLandmarkName(
  supabase: ReturnType<typeof getServiceClient>,
  point: { lat: number; lng: number },
  maxMeters = 400,
): Promise<string | null> {
  const { data, error } = await supabase.from("landmarks").select("label, lat, lng");
  if (error || !data?.length) return null;

  let best: { label: string; distance: number } | null = null;
  for (const row of data) {
    const distance = haversineMeters(point, row);
    if (distance <= maxMeters && (!best || distance < best.distance)) {
      best = { label: row.label, distance };
    }
  }
  return best?.label ?? null;
}
