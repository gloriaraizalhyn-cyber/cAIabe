import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { useGoogleMapsLoader, GOOGLE_MAPS_API_KEY } from "../hooks/useGoogleMapsLoader.js";
import "./MapView.css";

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
};

const WALK_LINE_COLOR = "#6b7280";
// Dashed line via a repeated line-symbol icon — Google Maps Polyline has no
// native "dashed" option, this is the documented workaround. Distinguishes
// a walking leg from a jeep ride leg, which otherwise render identically.
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

// origin/destination: { lat, lng } | null
// routes: [{ id, mapSegments: [{ kind: "walk" | "jeep", color, points: [{lat,lng}] }] }]
function MapView({ origin, destination, routes = [], center, zoom = 13 }) {
  const { isLoaded } = useGoogleMapsLoader();

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
      >
        {origin && <Marker position={origin} label="A" />}
        {destination && <Marker position={destination} label="B" />}
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
