import { useEffect, useState } from "react";

// route-search's walk legs only ever carry a straight [from, to] line —
// Distance Matrix (what the backend calls for walking time) doesn't return
// geometry, only Directions does. This resolves the real sidewalk-following
// path for each walk segment client-side, since the Maps JS script (and its
// DirectionsService) is already loaded here anyway.
//
// segments: [{ kind: "walk" | "jeep", path: [{lat,lng}, ...] }]
// Returns a map of segment index -> resolved walking path. A segment with
// no entry yet just means the request is still in flight (or failed) —
// callers should fall back to the segment's own straight-line path.
export function useWalkingLegPaths(segments, isLoaded) {
  const [resolvedPaths, setResolvedPaths] = useState({});

  // Reset synchronously during render (not in the effect below) when a new
  // route's segments come in. Resetting only in the effect leaves a window
  // where React can paint this render — new segments, but resolvedPaths
  // still keyed with the PREVIOUS route's resolved points — before the
  // effect clears it. Since resolvedPaths is keyed by index and most
  // itineraries have the same leg shape (walk, jeep, walk), that stale
  // frame silently reused the old route's walk geometry against the new
  // route's walk leg, i.e. the old dashed line briefly showing again after
  // a fresh search. Clearing here means the first render with new segments
  // never has stale entries to begin with.
  const [previousSegments, setPreviousSegments] = useState(segments);
  if (segments !== previousSegments) {
    setPreviousSegments(segments);
    setResolvedPaths({});
  }

  useEffect(() => {
    if (!isLoaded || !segments?.length) return;

    const directionsService = new window.google.maps.DirectionsService();
    let isCancelled = false;

    segments.forEach((segment, index) => {
      if (segment.kind !== "walk" || segment.path.length < 2) return;
      const origin = segment.path[0];
      const destination = segment.path[segment.path.length - 1];

      directionsService.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (isCancelled || status !== "OK" || !result?.routes?.[0]) return;
          const points = result.routes[0].overview_path.map((point) => ({
            lat: point.lat(),
            lng: point.lng(),
          }));
          setResolvedPaths((previous) => ({ ...previous, [index]: points }));
        }
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [segments, isLoaded]);

  return resolvedPaths;
}
