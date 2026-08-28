import { useEffect, useState } from "react";
import MapView from "../../shared/components/MapView.jsx";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./LiveTrackerPage.css";

const DEFAULT_CENTER = { lat: 15.1470, lng: 120.5850 };

function LiveTrackerPage() {
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const { jeepneys, isConnected } = useLiveDriverPositions(selectedRouteId);

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

  const availableCount = jeepneys.filter((j) => j.capacityState !== "full").length;
  const fullCount = jeepneys.filter((j) => j.capacityState === "full").length;

  return (
    <main className="live-tracker-page">
      <header className="live-tracker-page__header">
        <h1 className="live-tracker-page__title">Live Driver & Fleet Tracker</h1>
        <p className="live-tracker-page__subtitle">
          Pick a route to watch all active jeepneys moving smoothly along their path in real time.
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
            {isConnected
              ? `● Connected (${jeepneys.length} ${jeepneys.length === 1 ? "unit" : "units"} broadcasting)`
              : "Connecting…"}
          </span>
        )}
      </div>

      <div className="live-tracker-page__map">
        <MapView
          jeepneys={jeepneys}
          center={jeepneys[0] ? { lat: jeepneys[0].lat, lng: jeepneys[0].lng } : DEFAULT_CENTER}
          zoom={jeepneys.length > 0 ? 14 : 13}
        />
      </div>

      {selectedRouteId && (
        <div className="live-tracker-page__fleet-info">
          <div className="live-tracker-page__info-header">
            <div className="live-tracker-page__route-heading">
              <span className="live-tracker-page__route-name">{selectedRoute?.name}</span>
              <span className="live-tracker-page__unit-count">
                {jeepneys.length} {jeepneys.length === 1 ? "Jeepney" : "Jeepneys"} on Route
              </span>
            </div>
            <div className="live-tracker-page__summary-badges">
              <span className="live-tracker-page__badge live-tracker-page__badge--available">
                🟢 {availableCount} Seats Open
              </span>
              <span className="live-tracker-page__badge live-tracker-page__badge--full">
                🔴 {fullCount} Full
              </span>
            </div>
          </div>

          {jeepneys.length > 0 && (
            <div className="live-tracker-page__unit-list">
              {jeepneys.map((jeep, index) => (
                <div key={jeep.id} className="live-tracker-page__unit-card">
                  <span className="live-tracker-page__unit-label">🚐 Unit #{index + 1}</span>
                  <span
                    className={
                      jeep.capacityState === "full"
                        ? "live-tracker-page__capacity live-tracker-page__capacity--full"
                        : "live-tracker-page__capacity live-tracker-page__capacity--available"
                    }
                  >
                    {jeep.capacityState === "full" ? "FULL" : "SEATS OPEN"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default LiveTrackerPage;
