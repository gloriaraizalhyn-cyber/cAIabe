import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import RouteOptionCard from "./RouteOptionCard.jsx";
import "./TripResultsPanel.css";

const SORT_METRIC_TO_FIELD = {
  time: "travelMinutes",
  fare: "fare",
  distance: "distanceKm",
};

const SHEET_PEEK_RATIO = 0.46;

function shortenAddress(address) {
  return address.split(",")[0].trim();
}

function TripResultsPanel({
  origin,
  destination,
  routes,
  savedRouteKeys,
  onEditTrip,
  onTakeRoute,
  onSaveRoute,
  onFocusRoute,
}) {
  const [sortMetric, setSortMetric] = useState("time");
  // Until the rider actually picks a filter, the pick stays the AI-recommended
  // route. After that, the CAIABEST pick is the best route for that filter.
  const [hasChosenSort, setHasChosenSort] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [liveDragY, setLiveDragY] = useState(null);
  const dragStateRef = useRef(null);

  const recommendedRoute = routes.find((route) => route.isRecommended) ?? routes[0];

  const bestPickRoute = useMemo(() => {
    if (!recommendedRoute || !hasChosenSort) return recommendedRoute;
    const sortField = SORT_METRIC_TO_FIELD[sortMetric];
    // Ties keep the recommended route on top.
    return routes.reduce(
      (best, route) => (route[sortField] < best[sortField] ? route : best),
      recommendedRoute
    );
  }, [routes, recommendedRoute, hasChosenSort, sortMetric]);

  // "Time" is already highlighted when the results open, so tapping it again
  // changes nothing the rider can see — it must not count as choosing a
  // filter. It used to, which silently swapped the pick from the recommended
  // route to whichever was fastest by any margin (on the Astro Park demo trip:
  // a 2-transfer grey -> blue -> yellow route, under a minute faster but
  // P11 dearer than the recommended grey -> yellow).
  const handleChangeSortMetric = (metric) => {
    if (metric === sortMetric) return;
    setSortMetric(metric);
    setHasChosenSort(true);
  };

  const otherRoutes = useMemo(() => {
    const sortField = SORT_METRIC_TO_FIELD[sortMetric];
    return routes
      .filter((route) => route !== bestPickRoute)
      .sort((a, b) => a[sortField] - b[sortField]);
  }, [routes, sortMetric, bestPickRoute]);

  const sortedRoutes = bestPickRoute ? [bestPickRoute, ...otherRoutes] : [];
  const displayedOrigin = shortenAddress(origin);
  const displayedDestination = shortenAddress(destination);

  useEffect(() => {
    if (!bestPickRoute) return;
    setExpandedRouteId(bestPickRoute.cardKey ?? bestPickRoute.id);
  }, [bestPickRoute]);

  const peekOffsetPx = () => window.innerHeight * SHEET_PEEK_RATIO;

  const handleDragPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startY: event.clientY,
      baseline: isSheetExpanded ? 0 : peekOffsetPx(),
    };
    setLiveDragY(dragStateRef.current.baseline);
  };

  const handleDragPointerMove = (event) => {
    if (!dragStateRef.current) return;
    const delta = event.clientY - dragStateRef.current.startY;
    const max = peekOffsetPx();
    setLiveDragY(Math.min(Math.max(dragStateRef.current.baseline + delta, 0), max));
  };

  const handleDragPointerUp = () => {
    if (!dragStateRef.current) return;
    const max = peekOffsetPx();
    const { baseline } = dragStateRef.current;
    const finalY = liveDragY ?? baseline;
    if (Math.abs(finalY - baseline) < 6) {
      // A tap on the handle toggles the sheet.
      setIsSheetExpanded(!isSheetExpanded);
    } else if (isSheetExpanded) {
      // Pulling down only closes it once it has been dragged a little way.
      setIsSheetExpanded(finalY < max * 0.15);
    } else {
      // Pulling up opens it after roughly the first sixth of the travel,
      // instead of needing to cross the halfway point.
      setIsSheetExpanded(finalY < max * 0.85);
    }
    dragStateRef.current = null;
    setLiveDragY(null);
  };

  // All routes show on the map by default (each has its own accent color
  // to tell them apart) — expanding a specific card narrows the map down
  // to just that one route; collapsing it goes back to showing all of
  // them. Reporting `null` here is the "show everything" signal the
  // parent's MapView routes prop keys off of.
  useEffect(() => {
    const expandedRoute = sortedRoutes.find(
      (route) => (route.cardKey ?? route.id) === expandedRouteId
    );
    onFocusRoute?.(expandedRoute ?? null);
  }, [expandedRouteId, sortedRoutes, onFocusRoute]);

  // route.id is the real boarding route's id (needed as-is for the live GPS
  // step later), but two different itineraries can share it if they start
  // with the same route — route.cardKey is unique per itinerary, so that's
  // what identifies a specific card here rather than route.id.
  const handleToggleExpanded = (routeKey) => {
    setExpandedRouteId((current) => (current === routeKey ? null : routeKey));
  };

  return (
    <section
      className={`trip-results-panel${isSheetExpanded ? " trip-results-panel--expanded" : ""}`}
      style={liveDragY !== null ? { transform: `translateY(${liveDragY}px)`, transition: "none" } : undefined}
    >
      <div
        className="trip-results-panel__drag-handle"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
      >
        <span className="trip-results-panel__drag-handle-bar" />
      </div>
      <div className="trip-results-panel__header">
        <button type="button" className="trip-results-panel__edit-button" onClick={onEditTrip}>
          <ChevronLeft size={16} strokeWidth={2.25} />
          Edit trip
        </button>

        <div className="trip-results-panel__brand">
          <span className="trip-results-panel__brand-text">
            C<span className="trip-results-panel__brand-ai">AI</span>ABE
          </span>
        </div>
      </div>

      <p className="trip-results-panel__count">{sortedRoutes.length} ROUTE OPTIONS</p>
      <h1 className="trip-results-panel__title">
        {displayedOrigin} <span>&rarr;</span> {displayedDestination}
      </h1>

      {!bestPickRoute ? (
        <p className="trip-results-panel__empty">
          No routes found for this trip. Try a different origin or destination.
        </p>
      ) : (
        <div className="trip-results-panel__list">
          <RouteOptionCard
            route={bestPickRoute}
            isBestPick
            isExpanded={expandedRouteId === (bestPickRoute.cardKey ?? bestPickRoute.id)}
            onToggleExpanded={() => handleToggleExpanded(bestPickRoute.cardKey ?? bestPickRoute.id)}
            onTakeRoute={onTakeRoute}
            onSaveRoute={onSaveRoute}
            isSaved={savedRouteKeys?.has(bestPickRoute.cardKey ?? bestPickRoute.id)}
            sortMetric={sortMetric}
            onChangeSortMetric={handleChangeSortMetric}
          />

          {otherRoutes.length > 0 && (
            <p className="trip-results-panel__divider">
              <span>OTHER OPTIONS</span>
            </p>
          )}

          {otherRoutes.map((route) => (
            <RouteOptionCard
              key={route.cardKey ?? route.id}
              route={route}
              isBestPick={false}
              isExpanded={expandedRouteId === (route.cardKey ?? route.id)}
              onToggleExpanded={() => handleToggleExpanded(route.cardKey ?? route.id)}
              onTakeRoute={onTakeRoute}
              onSaveRoute={onSaveRoute}
              isSaved={savedRouteKeys?.has(route.cardKey ?? route.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default TripResultsPanel;

