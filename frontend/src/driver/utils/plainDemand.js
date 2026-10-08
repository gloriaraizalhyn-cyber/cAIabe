// Plain-language wording for the Sak.AI demand cards. The numbers all come
// from driver-demand-check; this only turns them into short sentences a
// driver can read at a glance (no scores, clusters or "compatible riders").

export function formatDistance(km) {
  if (km === null || km === undefined || !Number.isFinite(Number(km))) return null;
  const value = Number(km);
  return value < 1 ? `${Math.max(50, Math.round((value * 1000) / 10) * 10)} m` : `${value.toFixed(1)} km`;
}

export function passengerWord(count) {
  return count === 1 ? "passenger" : "passengers";
}

// One sentence for the WAIT / GO call.
export function describeWaitOrGo({ recommendation, compatibleCount, nearestDistanceKm }) {
  const count = Number(compatibleCount) || 0;
  const distance = formatDistance(nearestDistanceKm);

  if (recommendation === "go") {
    return `${count} ${passengerWord(count)} waiting ahead${distance ? `, the nearest ${distance} away` : ""}. You can leave now.`;
  }
  if (count > 0) {
    return `Only ${count} ${passengerWord(count)} waiting ahead. Wait a little for more.`;
  }
  return "No passengers waiting yet. Wait a little.";
}
