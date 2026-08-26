import { useEffect, useState } from "react";
import MapView from "../../shared/components/MapView.jsx";
import { useLiveDriverPosition } from "../../shared/hooks/useLiveDriverPosition.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./LiveTrackerPage.css";

// Demo-only screen: pick a route, then watch the live GPS + capacity
// broadcasts a driving unit sends (e.g. via mock-driver-simulator.js at the
// repo root) render as a moving marker in real time. Subscribes to the same
// `route:{route_id}:driving` channel driver-location-update and
// driver-capacity-toggle already broadcast to — no new backend needed.
const DEFAULT_CENTER = { lat: 15.15, lng: 120.6 };

function LiveTrackerPage() {
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const { position: driverPosition, capacityState, isConnected } = useLiveDriverPosition(selectedRouteId);

  useEffect(() => {
    supabase
      .from("routes")
      .select("id, name, color")
      .order("name")
      .then(({ data }) => {
        if (data) setRoutes(data);
      });
  }, []);

  const selectedRoute = routes.find((route) => route.id === selectedRouteId);

  return (
    <main className="live-tracker-page">
      <header className="live-tracker-page__header">
        <h1 className="live-tracker-page__title">Live Driver Tracker</h1>
        <p className="live-tracker-page__subtitle">
          Pick a route to watch real GPS and capacity broadcasts from a driving unit.
        </p>
      </header>

      <div className="live-tracker-page__controls">
        <select
          className="live-tracker-page__route-select"
          value={selectedRouteId}
          onChange={(event) => setSelectedRouteId(event.target.value)}
        >
          <option value="">Select a route…</option>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>

        {selectedRouteId && (
          <span
            className={
              isConnected
                ? "live-tracker-page__status live-tracker-page__status--live"
                : "live-tracker-page__status"
            }
          >
            {isConnected ? "● Connected — waiting for GPS" : "Connecting…"}
          </span>
        )}
      </div>

      <div className="live-tracker-page__map">
        <MapView
          origin={driverPosition}
          center={driverPosition ?? DEFAULT_CENTER}
          zoom={driverPosition ? 15 : 12}
        />
      </div>

      {driverPosition && (
        <div className="live-tracker-page__info">
          <span className="live-tracker-page__route-name">{selectedRoute?.name}</span>
          <span
            className={
              capacityState === "full"
                ? "live-tracker-page__capacity live-tracker-page__capacity--full"
                : "live-tracker-page__capacity"
            }
          >
            {capacityState === "full" ? "FULL" : "SEATS OPEN"}
          </span>
        </div>
      )}
    </main>
  );
}

export default LiveTrackerPage;
