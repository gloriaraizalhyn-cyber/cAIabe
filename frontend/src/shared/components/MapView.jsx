import { useEffect, useRef, useState, useCallback } from "react";
import { GoogleMap, Marker, Polyline, InfoWindow, DirectionsRenderer, OverlayView } from "@react-google-maps/api";
import { useGoogleMapsLoader, HAS_GOOGLE_MAPS_API_KEY } from "../hooks/useGoogleMapsLoader.js";
import { useWalkingLegPaths } from "../hooks/useWalkingLegPaths.js";
import { getRouteColorMeta } from "../utils/routeColorHelpers.js";
import "./MapView.css";

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: "greedy",
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

// A near-white route line is invisible against the map's light basemap, so
// it gets a thin gray outline underneath — everything else renders as-is.
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

// Generates a custom, high-DPI SVG marker icon that uses the jeepney route's
// official color from caiabe_seed_routes.sql for the vehicle pin body, while
// dynamically displaying the FULL (red) or SEATS OPEN (green) status pill.
function createJeepneyMarkerIcon(capacityState, routeHexColor = "#CB4747", routeColorName = "Jeep") {
  const isFull = capacityState === "full";
  const statusColor = isFull ? "#dc2626" : "#16a34a";
  const badgeText = isFull ? "FULL" : "SEATS OPEN";

  // A full jeep's marker turns red outright (not just the status pill) so
  // it reads at a glance on a crowded map — reverts to the route's own
  // color the moment a seat opens up, per the product spec.
  const pinBorderColor = isFull ? statusColor : routeHexColor || "#CB4747";
  const pinFillColor = "#ffffff";
  const iconColor = isFull ? statusColor : (pinBorderColor.toLowerCase() === "#ffffff" ? "#1f2937" : pinBorderColor);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="74" viewBox="0 0 64 74">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
      </defs>
      <!-- Base pin circle in Official Route Color -->
      <circle cx="32" cy="27" r="22" fill="${pinFillColor}" stroke="${pinBorderColor}" stroke-width="4" filter="url(#shadow)"/>
      <!-- Jeepney vehicle silhouette in Route Color -->
      <g transform="translate(20, 15) scale(0.7)" fill="${iconColor}">
        <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
      </g>
      <!-- Capacity Status pill badge (Green = Seats Open, Red = Full) -->
      <rect x="4" y="52" width="56" height="18" rx="9" fill="${statusColor}" filter="url(#shadow)"/>
      <text x="32" y="64.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="8.5" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.3">${badgeText}</text>
    </svg>
  `;

  if (typeof window !== "undefined" && window.google?.maps) {
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(48, 56),
      anchor: new window.google.maps.Point(24, 28),
    };
  }

  return undefined;
}

// waitingPassengers: [{ id, lat, lng }] — one pin per individual waiting
// passenger compatible with the driver's route (from driver-demand-check),
// rendered as a plain yellow dot per the product spec's "waiting status
// (YELLOW ICON)" — distinct from the clustered demand summary below, which
// stays for the driver's WAIT/GO scoring context.
function WaitingPassengerMarkers({ passengers }) {
  if (!passengers?.length || typeof window === "undefined" || !window.google?.maps) return null;

  return (
    <>
      {passengers.map((passenger) => (
        <Marker
          key={`waiting-${passenger.id}`}
          position={{ lat: passenger.lat, lng: passenger.lng }}
          title="Waiting passenger"
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#eab308",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 7,
          }}
        />
      ))}
    </>
  );
}

// demandClusters: [{ lat, lng, count, distance_km, band, band_label }] —
// Sak.AI driver-side passenger-demand clusters from driver-demand-check,
// rendered as grouped pins distinct from live jeepney markers so a driver
// can see "there are passengers ahead of me" at a glance.
function DemandClusterMarkers({ clusters }) {
  if (!clusters?.length) return null;

  return (
    <>
      {clusters.map((cluster, index) => (
        <OverlayView
          key={`demand-cluster-${index}`}
          position={{ lat: cluster.lat, lng: cluster.lng }}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -height - 6 })}
        >
          <div className={`map-view__demand-cluster map-view__demand-cluster--${cluster.band}`}>
            <span className="map-view__demand-cluster-count">👥 {cluster.count}</span>
            <span className="map-view__demand-cluster-band">{cluster.band_label}</span>
            <span className="map-view__demand-cluster-distance">{cluster.distance_km} km</span>
            <span className="map-view__demand-cluster-stem" />
          </div>
        </OverlayView>
      ))}
    </>
  );
}

// Interpolates vehicle GPS movements smoothly over time at 60 FPS using
// requestAnimationFrame so vehicles glide continuously along streets instead
// of jumping or popping between discrete coordinate updates.
function useSmoothPositions(jeepneys) {
  const [animatedPositions, setAnimatedPositions] = useState({});
  const tracksRef = useRef({});
  const animFrameRef = useRef(null);

  useEffect(() => {
    const now = performance.now();
    const currentTracks = tracksRef.current;
    let hasUpdates = false;

    jeepneys.forEach((jeep) => {
      const existing = currentTracks[jeep.id];
      if (!existing) {
        currentTracks[jeep.id] = {
          currentLat: jeep.lat,
          currentLng: jeep.lng,
          targetLat: jeep.lat,
          targetLng: jeep.lng,
          startLat: jeep.lat,
          startLng: jeep.lng,
          startTime: now,
          duration: 900,
          capacityState: jeep.capacityState ?? "available",
        };
        hasUpdates = true;
      } else {
        const moved = existing.targetLat !== jeep.lat || existing.targetLng !== jeep.lng;
        const capacityChanged = existing.capacityState !== jeep.capacityState;

        if (moved) {
          existing.startLat = existing.currentLat;
          existing.startLng = existing.currentLng;
          existing.targetLat = jeep.lat;
          existing.targetLng = jeep.lng;
          existing.startTime = now;
          existing.duration = 900;
          hasUpdates = true;
        }

        if (capacityChanged && jeep.capacityState) {
          existing.capacityState = jeep.capacityState;
          hasUpdates = true;
        }
      }
    });

    const activeIds = new Set(jeepneys.map((j) => j.id));
    Object.keys(currentTracks).forEach((id) => {
      if (!activeIds.has(id)) {
        delete currentTracks[id];
        hasUpdates = true;
      }
    });

    if (hasUpdates) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const step = (time) => {
        let isStillAnimating = false;
        const nextPositions = {};

        Object.entries(tracksRef.current).forEach(([id, track]) => {
          const elapsed = time - track.startTime;
          const progress = Math.min(Math.max(elapsed / track.duration, 0), 1);

          track.currentLat = track.startLat + (track.targetLat - track.startLat) * progress;
          track.currentLng = track.startLng + (track.targetLng - track.startLng) * progress;

          nextPositions[id] = {
            id,
            lat: track.currentLat,
            lng: track.currentLng,
            capacityState: track.capacityState,
          };

          if (progress < 1) {
            isStillAnimating = true;
          }
        });

        setAnimatedPositions(nextPositions);

        if (isStillAnimating) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          animFrameRef.current = null;
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    }
  }, [jeepneys]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return Object.values(animatedPositions);
}

// origin/destination: { lat, lng } | null
// routes: [{ id, cardKey?, accentColor, path, pathSegments? }] — cardKey,
// when present, is preferred for keys since id alone isn't guaranteed
// unique per itinerary (see adaptRouteSearchResult.js). pathSegments, when
// present, is [{ kind: "walk" | "jeep", path }] and draws per-leg dashed/
// solid styling; without it this falls back to one solid line from `path`.
// jeepneys: [{ id, lat, lng, capacityState }] — every jeepney currently
// broadcasting position on a route (see useLiveDriverPositions); unrelated
// to `routes` and used by the waiting-for-jeep / driving screens, not the
// route-search results.
// waitingPassengers: [{ id, lat, lng }] — driver-side only, from
// driver-demand-check; see WaitingPassengerMarkers above.
function MapView({
  origin,
  destination,
  routes = [],
  jeepneys = [],
  demandClusters = [],
  waitingPassengers = [],
  center,
  zoom = 13,
  showDirections = false,
  isOwnJeepneyIdling = false,
}) {
  const { isLoaded } = useGoogleMapsLoader();
  const [selectedJeepneyId, setSelectedJeepneyId] = useState(null);
  const [directionsResult, setDirectionsResult] = useState(null);
  const mapRef = useRef(null);

  const smoothJeepneys = useSmoothPositions(jeepneys);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Compute real-time Google Directions road polyline when origin and destination are present
  useEffect(() => {
    if (!isLoaded || !window.google?.maps || !origin || !destination) {
      setDirectionsResult(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirectionsResult(result);
        } else {
          console.warn("Directions request returned:", status);
          setDirectionsResult(null);
        }
      }
    );
  }, [isLoaded, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  // Dynamically adjust map bounds to frame origin, destination, routes, and
  // all live jeepneys — re-runs whenever any of the points we have to show
  // change, since the map only ever gets an initial center/zoom from props.
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    if (origin) {
      bounds.extend(origin);
      hasPoints = true;
    }
    if (destination) {
      bounds.extend(destination);
      hasPoints = true;
    }
    if (smoothJeepneys.length > 0) {
      smoothJeepneys.forEach((jeep) => {
        bounds.extend({ lat: jeep.lat, lng: jeep.lng });
        hasPoints = true;
      });
    }
    routes.forEach((route) => {
      (route.path ?? []).forEach((point) => {
        bounds.extend(point);
        hasPoints = true;
      });
    });
    demandClusters.forEach((cluster) => {
      bounds.extend({ lat: cluster.lat, lng: cluster.lng });
      hasPoints = true;
    });
    waitingPassengers.forEach((passenger) => {
      bounds.extend({ lat: passenger.lat, lng: passenger.lng });
      hasPoints = true;
    });

    if (!hasPoints) return;
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      // Only one distinct point so far (e.g. just the origin picked) —
      // fitBounds on a zero-size box zooms in awkwardly far, so just
      // center on it instead and leave the zoom alone.
      mapRef.current.panTo(bounds.getCenter());
      return;
    }
    mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 60, left: 50 });
  }, [origin, destination, routes, smoothJeepneys.length, demandClusters, waitingPassengers]);

  if (!HAS_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="map-view map-view--placeholder">
        <div className="map-view__placeholder-card">
          <p className="map-view__placeholder-title">Live map not connected yet</p>
          <p className="map-view__placeholder-body">
            Add a real <code>VITE_GOOGLE_MAPS_API_KEY</code> value to{" "}
            <code>frontend/.env.local</code>. The current value is a placeholder,
            so Google refuses to load the map.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="map-view" />;
  }

  const selectedJeep = smoothJeepneys.find((j) => j.id === selectedJeepneyId);

  // Compute on-route midpoint coordinate and ETA callout data (Google Maps navigation style)
  let etaCalloutData = null;
  if (directionsResult && directionsResult.routes?.[0]) {
    const leg = directionsResult.routes[0].legs?.[0];
    const path = directionsResult.routes[0].overview_path;
    const midPoint = path?.[Math.floor((path.length || 1) / 2)];
    if (midPoint && leg) {
      const routeMeta = getRouteColorMeta(
        routes[0]?.accentColor || routes[0]?.color,
        routes[0]?.title || routes[0]?.name
      );
      etaCalloutData = {
        position: { lat: midPoint.lat(), lng: midPoint.lng() },
        duration: leg.duration?.text || `${routes[0]?.travelMinutes || 15} min`,
        distance: leg.distance?.text || `${routes[0]?.distanceKm || 4.5} km`,
        routeName: routeMeta.name ? `${routeMeta.name} Jeep` : null,
        routeColor: routeMeta.hex,
      };
    }
  } else if (routes[0]?.pathSegments?.length) {
    const allPts = routes[0].pathSegments.flatMap((s) => s.path || []);
    if (allPts.length > 0) {
      const midPoint = allPts[Math.floor(allPts.length / 2)];
      const routeMeta = getRouteColorMeta(
        routes[0]?.accentColor || routes[0]?.color,
        routes[0]?.title || routes[0]?.name
      );
      etaCalloutData = {
        position: midPoint,
        duration: `${routes[0].travelMinutes || 15} min`,
        distance: `${routes[0].distanceKm || 4.2} km`,
        routeName: `${routeMeta.name} Jeep`,
        routeColor: routeMeta.hex,
      };
    }
  } else if (origin && destination) {
    const midPoint = {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
    etaCalloutData = {
      position: midPoint,
      duration: "15 min",
      distance: "4.2 km",
      routeName: null,
      routeColor: "#2563eb",
    };
  }

  return (
    <div className="map-view">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center ?? origin ?? { lat: 15.1470, lng: 120.5850 }}
        zoom={zoom}
        options={mapOptions}
        onLoad={onMapLoad}
      >
        {/* Render Google Maps Navigation Directions Polyline */}
        {directionsResult && (showDirections || routes.length === 0) && (
          <DirectionsRenderer
            directions={directionsResult}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "#2563eb",
                strokeWeight: 6,
                strokeOpacity: 0.85,
              },
            }}
          />
        )}

        {/* On-Route Navigation ETA Callout Badge (Google Maps Style) */}
        {etaCalloutData && (
          <OverlayView
            position={etaCalloutData.position}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={(width, height) => ({
              x: -(width / 2),
              y: -height - 12,
            })}
          >
            <div className="map-view__route-callout">
              <div className="map-view__route-callout-card">
                <div className="map-view__route-callout-row">
                  <span className="map-view__route-callout-icon">🚐</span>
                  <span className="map-view__route-callout-time">{etaCalloutData.duration}</span>
                </div>
                <div className="map-view__route-callout-sub">
                  <span>{etaCalloutData.distance}</span>
                  {etaCalloutData.routeName && (
                    <span
                      className="map-view__route-callout-tag"
                      style={{ color: etaCalloutData.routeColor }}
                    >
                      • {etaCalloutData.routeName}
                    </span>
                  )}
                </div>
              </div>
              <div className="map-view__route-callout-stem" />
            </div>
          </OverlayView>
        )}

        {/* Origin and Destination Markers */}
        {origin && <Marker position={origin} label="A" title="Origin" />}
        {destination && <Marker position={destination} label="B" title="Destination" />}

        {/* Live Jeepney Fleet Markers (Strictly on selected route in Official Color) */}
        {smoothJeepneys.map((jeep) => {
          const isFull = jeep.capacityState === "full";
          const routeMeta = getRouteColorMeta(
            jeep.color || routes[0]?.accentColor || routes[0]?.color,
            jeep.routeName || routes[0]?.title || routes[0]?.name
          );
          const icon = createJeepneyMarkerIcon(jeep.capacityState, routeMeta.hex, routeMeta.name);

          return (
            <Marker
              key={jeep.id}
              position={{ lat: jeep.lat, lng: jeep.lng }}
              icon={icon}
              title={`Jeepney: ${routeMeta.name} Line — ${isFull ? "FULL (No Seats)" : "SEATS AVAILABLE"}`}
              onClick={() => setSelectedJeepneyId(jeep.id)}
            />
          );
        })}

        {/* Sak.AI roadside-idling badge on the driver's own marker — mirrors
            DemandClusterMarkers' OverlayView pattern rather than the marker
            icon SVG, since useSmoothPositions rebuilds jeepney objects as
            bare {id,lat,lng,capacityState} every frame and would silently
            drop any extra field passed via the jeepneys prop. */}
        {isOwnJeepneyIdling && (() => {
          const ownJeep = smoothJeepneys.find((jeep) => jeep.id === "self");
          if (!ownJeep) return null;
          return (
            <OverlayView
              position={{ lat: ownJeep.lat, lng: ownJeep.lng }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={(width, height) => ({ x: -(width / 2), y: -height - 44 })}
            >
              <div className="map-view__idling-badge">⚠️ Idling</div>
            </OverlayView>
          );
        })()}

        {/* Interactive Jeepney Status Popup */}
        {selectedJeep && (
          <InfoWindow
            position={{ lat: selectedJeep.lat, lng: selectedJeep.lng }}
            onCloseClick={() => setSelectedJeepneyId(null)}
          >
            <div className="map-view__infowindow">
              <div className="map-view__infowindow-header">
                <span
                  className="map-view__infowindow-title"
                  style={{
                    color: getRouteColorMeta(
                      selectedJeep.color || routes[0]?.accentColor || routes[0]?.color,
                      routes[0]?.title || routes[0]?.name
                    ).hex,
                  }}
                >
                  {getRouteColorMeta(
                    selectedJeep.color || routes[0]?.accentColor || routes[0]?.color,
                    routes[0]?.title || routes[0]?.name
                  ).name} Jeepney
                </span>
                <span
                  className={
                    selectedJeep.capacityState === "full"
                      ? "map-view__infowindow-badge map-view__infowindow-badge--full"
                      : "map-view__infowindow-badge map-view__infowindow-badge--available"
                  }
                >
                  {selectedJeep.capacityState === "full" ? "FULL" : "SEATS OPEN"}
                </span>
              </div>
              <p className="map-view__infowindow-status">
                {selectedJeep.capacityState === "full"
                  ? "Unit is currently full. Next vehicle is en route."
                  : "Seats are currently available for boarding."}
              </p>
            </div>
          </InfoWindow>
        )}

        {/* Route polylines — one per leg, dashed for walks / solid for rides */}
        {routes.map((route) => (
          <RoutePolylines key={route.cardKey ?? route.id} route={route} />
        ))}

        {/* Sak.AI passenger-demand clusters (driver-side) */}
        <DemandClusterMarkers clusters={demandClusters} />

        {/* Individual waiting-passenger pins (driver-side) */}
        <WaitingPassengerMarkers passengers={waitingPassengers} />
      </GoogleMap>
    </div>
  );
}

export default MapView;
