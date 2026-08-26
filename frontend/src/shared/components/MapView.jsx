import { useEffect, useRef, useState, useCallback } from "react";
import { GoogleMap, Marker, Polyline, InfoWindow, DirectionsRenderer, OverlayView } from "@react-google-maps/api";
import { useGoogleMapsLoader, GOOGLE_MAPS_API_KEY } from "../hooks/useGoogleMapsLoader.js";
import "./MapView.css";

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
};

const WALK_LINE_COLOR = "#6b7280";
const WALK_LINE_OPTIONS = {
  strokeOpacity: 0,
  icons: [
    {
      icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: WALK_LINE_COLOR, scale: 3 },
      offset: "0",
      repeat: "12px",
    },
  ],
};

import { getRouteColorMeta } from "../utils/routeColorHelpers.js";

// Generates a custom, high-DPI SVG marker icon that uses the jeepney route's
// official color from caiabe_seed_routes.sql for the vehicle pin body, while
// dynamically displaying the FULL (red) or SEATS OPEN (green) status pill.
function createJeepneyMarkerIcon(capacityState, routeHexColor = "#CB4747", routeColorName = "Jeep") {
  const isFull = capacityState === "full";
  const statusColor = isFull ? "#dc2626" : "#16a34a";
  const badgeText = isFull ? "FULL" : "SEATS OPEN";

  const pinBorderColor = routeHexColor || "#CB4747";
  const pinFillColor = "#ffffff";
  const iconColor = pinBorderColor.toLowerCase() === "#ffffff" ? "#1f2937" : pinBorderColor;

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
// routes: [{ id, mapSegments: [{ kind: "walk" | "jeep", color, points: [{lat,lng}] }] }]
// jeepneys: [{ id, lat, lng, capacityState }] — live broadcasting vehicles strictly on this route
function MapView({
  origin,
  destination,
  routes = [],
  jeepneys = [],
  center,
  zoom = 13,
  showDirections = false,
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

  // Dynamically adjust map bounds to frame origin, destination, routes, and all live jeepneys
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
    if (routes.length > 0) {
      routes.forEach((route) => {
        route.mapSegments?.forEach((segment) => {
          segment.points?.forEach((point) => {
            bounds.extend(point);
            hasPoints = true;
          });
        });
      });
    }

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 60, left: 50 });
    }
  }, [origin, destination, routes, smoothJeepneys.length]);

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
  } else if (routes[0]?.mapSegments?.length) {
    const allPts = routes[0].mapSegments.flatMap((s) => s.points || []);
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

        {/* Multi-Leg Trip Segments (Walking + Jeepney Segments) */}
        {routes.flatMap((route) =>
          (route.mapSegments ?? []).map((segment, index) => (
            <Polyline
              key={`${route.id}-${index}`}
              path={segment.points}
              options={
                segment.kind === "walk"
                  ? WALK_LINE_OPTIONS
                  : { strokeColor: segment.color, strokeWeight: 5, strokeOpacity: 0.9 }
              }
            />
          ))
        )}
      </GoogleMap>
    </div>
  );
}

export default MapView;
