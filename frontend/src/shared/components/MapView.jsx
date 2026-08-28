import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { useGoogleMapsLoader, GOOGLE_MAPS_API_KEY } from "../hooks/useGoogleMapsLoader.js";
import "./MapView.css";

const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
};

// origin/destination: { lat, lng } | null
// routes: [{ id, accentColor, path: [{ lat, lng }] }]
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
        {routes.map((route) => (
          <Polyline
            key={route.id}
            path={route.path}
            options={{
              strokeColor: route.accentColor,
              strokeWeight: 5,
              strokeOpacity: 0.9,
            }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}

export default MapView;
