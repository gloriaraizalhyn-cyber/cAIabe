import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import RouteOptionCard from "./RouteOptionCard.jsx";
import "./TripResultsPanel.css";

const SORT_METRIC_TO_FIELD = {
  time: "travelMinutes",
  fare: "fare",
  distance: "distanceKm",
};

function TripResultsPanel({ origin, destination, routes, onEditTrip, onTakeRoute, onSaveRoute }) {
  const [sortMetric, setSortMetric] = useState("time");
  const [expandedRouteId, setExpandedRouteId] = useState(null);

  const sortedRoutes = useMemo(() => {
    const sortField = SORT_METRIC_TO_FIELD[sortMetric];
    return [...routes].sort((a, b) => a[sortField] - b[sortField]);
  }, [routes, sortMetric]);

  const [bestPickRoute, ...otherRoutes] = sortedRoutes;

  const handleToggleExpanded = (routeId) => {
    setExpandedRouteId((current) => (current === routeId ? null : routeId));
  };

  return (
    <section className="trip-results-panel">
      <button type="button" className="trip-results-panel__edit-button" onClick={onEditTrip}>
        <ChevronLeft size={16} strokeWidth={2.25} />
        Edit trip
      </button>

      <p className="trip-results-panel__count">{sortedRoutes.length} ROUTE OPTIONS</p>
      <h1 className="trip-results-panel__title">
        {origin} <span>&rarr;</span> {destination}
      </h1>

      <div className="trip-results-panel__list">
        <RouteOptionCard
          route={bestPickRoute}
          isBestPick
          isExpanded={expandedRouteId === bestPickRoute.id}
          onToggleExpanded={() => handleToggleExpanded(bestPickRoute.id)}
          onTakeRoute={onTakeRoute}
          onSaveRoute={onSaveRoute}
          sortMetric={sortMetric}
          onChangeSortMetric={setSortMetric}
        />

        <p className="trip-results-panel__divider">
          <span>OTHER OPTIONS</span>
        </p>

        {otherRoutes.map((route) => (
          <RouteOptionCard
            key={route.id}
            route={route}
            isBestPick={false}
            isExpanded={expandedRouteId === route.id}
            onToggleExpanded={() => handleToggleExpanded(route.id)}
            onTakeRoute={onTakeRoute}
            onSaveRoute={onSaveRoute}
          />
        ))}
      </div>
    </section>
  );
}

export default TripResultsPanel;
