import { useEffect, useRef } from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { useGoogleMapsLoader, GOOGLE_MAPS_API_KEY } from "../hooks/useGoogleMapsLoader.js";
import { useWalkingLegPaths } from "../hooks/useWalkingLegPaths.js";
import "./MapView.css";

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
};

// Polyline has no native dashed strokeStyle — a short dash symbol repeated
// along the line (Google's documented technique) is what actually produces
// one. Paired with strokeOpacity: 0 on the base line so only the dashes show.
const WALK_SEGMENT_ICONS = [
  {
    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 },
    offset: "0",
    repeat: "20px",
  },
];

function isWhiteRouteColor(color) {
  if (!color?.startsWith("#")) return false;
  const hex = color.slice(1);
  const value = hex.length === 3
    ? hex.split("").map((part) => part + part).join("")
    : hex;
  if (value.length !== 6) return false;
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return Math.min(...channels) >= 190 && Math.max(...channels) - Math.min(...channels) <= 35;
}

function segmentPolylineOptions(kind, accentColor) {
  if (kind === "walk") {
    return { strokeOpacity: 0, strokeColor: accentColor, icons: WALK_SEGMENT_ICONS };
  }
  return { strokeColor: accentColor, strokeWeight: 5, strokeOpacity: 0.9 };
}

function JeepSegmentPolylines({ path, accentColor, keyPrefix }) {
  if (!isWhiteRouteColor(accentColor)) {
    return <Polyline path={path} options={segmentPolylineOptions("jeep", accentColor)} />;
  }

  return (
    <>
      <Polyline
        key={`${keyPrefix}-outline`}
        path={path}
        options={{ strokeColor: "#8a8f99", strokeWeight: 8, strokeOpacity: 0.9 }}
      />
      <Polyline
        key={`${keyPrefix}-fill`}
        path={path}
        options={segmentPolylineOptions("jeep", accentColor)}
      />
    </>
  );
}

// Draws one route as several polylines (one per leg) rather than a single
// line, so walk legs render dashed and ride legs solid — matching how
// Google Maps itself distinguishes walking from riding. Walk legs start
// out as a straight line (all route-search gives us) and swap to the real
// sidewalk-following path once useWalkingLegPaths resolves it.
function RoutePolylines({ route }) {
  const keyBase = route.cardKey ?? route.id;
  const resolvedWalkingPaths = useWalkingLegPaths(route.pathSegments, true);

  if (!route.pathSegments?.length) {
    // Fallback for callers without per-leg segments (e.g. fixture data) —
    // draw the whole thing as one solid line.
    return <JeepSegmentPolylines path={route.path} accentColor={route.accentColor} keyPrefix={keyBase} />;
  }

  return (
    <>
      {route.pathSegments.map((segment, index) => {
        // Walk legs only ever start out as a straight [from, to] line (see
        // useWalkingLegPaths) — drawing that immediately means it briefly
        // cuts through buildings until the real path resolves a moment
        // later. Skipping the segment until then avoids showing that wrong
        // line at all; ride legs already have real geometry, so those
        // always render.
        if (segment.kind === "walk" && !resolvedWalkingPaths[index]) return null;
        const path = resolvedWalkingPaths[index] ?? segment.path;
        if (segment.kind === "jeep") {
          return (
            <JeepSegmentPolylines
              key={`${keyBase}-seg-${index}`}
              path={path}
              accentColor={route.accentColor}
              keyPrefix={`${keyBase}-seg-${index}`}
            />
          );
        }
        return <Polyline key={`${keyBase}-seg-${index}`} path={path} options={segmentPolylineOptions(segment.kind, route.accentColor)} />;
      })}
    </>
  );
}

// origin/destination: { lat, lng } | null
// routes: [{ id, cardKey?, accentColor, path, pathSegments? }] — cardKey,
// when present, is preferred for keys since id alone isn't guaranteed
// unique per itinerary (see adaptRouteSearchResult.js). pathSegments, when
// present, is [{ kind: "walk" | "jeep", path }] and draws per-leg dashed/
// solid styling; without it this falls back to one solid line from `path`.
function MapView({ origin, destination, routes = [], center, zoom = 13 }) {
  const { isLoaded } = useGoogleMapsLoader();
  const mapRef = useRef(null);

  const handleMapLoad = (map) => {
    mapRef.current = map;
  };

  // The map only ever gets an initial center/zoom from props — once a
  // destination or route paths come in, nothing was re-framing the view
  // around them, so the map kept sitting at the origin's default zoom
  // while the actual route (and often the destination marker) sat
  // entirely outside the visible area. Refit whenever the points we have
  // to show change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    const bounds = new window.google.maps.LatLngBounds();
    if (origin) bounds.extend(origin);
    if (destination) bounds.extend(destination);
    routes.forEach((route) => {
      (route.path ?? []).forEach((point) => bounds.extend(point));
    });

    if (bounds.isEmpty()) return;
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      // Only one distinct point so far (e.g. just the origin picked) —
      // fitBounds on a zero-size box zooms in awkwardly far, so just
      // center on it instead and leave the zoom alone.
      map.panTo(bounds.getCenter());
      return;
    }
    map.fitBounds(bounds, 56);
  }, [origin, destination, routes]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="map-view map-view--placeholder">
        <div className="map-view__placeholder-card">
          <p className="map-view__placeholder-title">Live map not connected yet</p>
          <p className="map-view__placeholder-body">
            Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to{" "}
            <code>frontend/.env.local</code> to render the real Google Map
            here. Route cards and colors are already wired up to it.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="map-view" />;
  }

  return (
    <div className="map-view">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center ?? origin ?? { lat: 15.186, lng: 120.56 }}
        zoom={zoom}
        options={mapOptions}
        onLoad={handleMapLoad}
      >
        {origin && <Marker position={origin} label="A" />}
        {destination && <Marker position={destination} label="B" />}
        {routes.map((route) => (
          <RoutePolylines key={route.cardKey ?? route.id} route={route} />
        ))}
      </GoogleMap>
    </div>
  );
}

export default MapView;
