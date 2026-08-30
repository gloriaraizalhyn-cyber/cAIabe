import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import NextToGoCard from "../components/NextToGoCard.jsx";
import WaitOrGoCard from "../components/WaitOrGoCard.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { useDriverDemand } from "../hooks/useDriverDemand.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import { fetchOwnQueueEntry } from "../utils/queue.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./NextToGoPage.css";

function NextToGoPage() {
  const navigate = useNavigate();
  const { driver, loading, session } = useDriverSession();
  const [ownQueueEntry, setOwnQueueEntry] = useState(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [driverPosition, setDriverPosition] = useState(null);
  const [isUsingDemoPosition, setIsUsingDemoPosition] = useState(false);
  const [isSkippingToDriving, setIsSkippingToDriving] = useState(false);

  useEffect(() => {
    if (isUsingDemoPosition || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setDriverPosition({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isUsingDemoPosition]);

  // Demo/testing bypass — sidesteps real device GPS entirely (useful when
  // testing from outside Clark/Angeles, or without granting location at
  // all) by placing the driver at their own terminal's real coordinates.
  // The AI itself is unaffected — only where the driver's position comes
  // from changes.
  const handleUseTerminalLocation = () => {
    if (!driver?.terminal?.position) return;
    setIsUsingDemoPosition(true);
    setDriverPosition(driver.terminal.position);
  };

  const refreshQueueEntry = useCallback(async () => {
    if (!driver?.route?.id || !session?.user?.id) return;
    const entry = await fetchOwnQueueEntry(driver.route.id, session.user.id);
    setOwnQueueEntry(entry);
  }, [driver?.route?.id, session?.user?.id]);

  // Sak.AI "WAIT or GO?" — real passenger_waiting_state demand on this
  // driver's own route, scored server-side (see driver-demand-check).
  const { data: demand, isLoading: isDemandLoading, error: demandError } = useDriverDemand({
    routeId: driver?.route?.id,
    position: driverPosition,
    isActive: true,
  });

  useEffect(() => {
    refreshQueueEntry();
  }, [refreshQueueEntry]);

  // Promotion to "driving" happens automatically once the unit ahead departs
  // (queue-advance) — there's no manual "go" action on this page, so the
  // moment our own status flips, move straight to the driving screen.
  useEffect(() => {
    if (ownQueueEntry?.status === "driving") {
      navigate("/driver/driving");
    }
  }, [ownQueueEntry?.status, navigate]);

  // passenger_waiting_state has no public RLS (service-role/broadcast only,
  // by design — see schema.sql), so this broadcast-tallied count still
  // starts at 0 with no historical backfill of its own — it's only kept as
  // a fallback for the brief window before driver-demand-check's first
  // response lands (that response's compatible_passenger_count IS backfilled
  // via a real query, and takes over below once available).
  useEffect(() => {
    if (!driver?.route?.id) return undefined;
    const waitingIds = new Set();

    const channel = supabase
      .channel(`route:${driver.route.id}:waiting`)
      .on("broadcast", { event: "passenger_waiting" }, ({ payload }) => {
        waitingIds.add(payload.waiting_id);
        setWaitingCount(waitingIds.size);
      })
      .on("broadcast", { event: "passenger_cleared" }, ({ payload }) => {
        waitingIds.delete(payload.waiting_id);
        setWaitingCount(waitingIds.size);
      })
      .subscribe();

    const queueChannel = supabase
      .channel(`route:${driver.route.id}:queue`)
      .on("broadcast", { event: "driver_notified" }, refreshQueueEntry)
      .on("broadcast", { event: "queue_updated" }, refreshQueueEntry)
      .on("broadcast", { event: "driver_departed" }, refreshQueueEntry)
      .subscribe();

    const pollId = setInterval(refreshQueueEntry, 15000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(queueChannel);
      clearInterval(pollId);
    };
  }, [driver?.route?.id, refreshQueueEntry]);

  // "Wait for more" has no backend concept — staying on this page already
  // is the "wait" behavior, so this stays a no-op as it was before.
  const handleWaitForMore = () => {};

  // Testing/demo bypass — invokes queue-advance directly (the exact same
  // function the cron calls) instead of waiting for its next tick, so
  // next_to_go -> driving promotion happens immediately. The existing
  // "status === driving" effect above handles navigating away once
  // refreshQueueEntry picks up the change.
  const handleSkipToDriving = async () => {
    setIsSkippingToDriving(true);
    await supabase.functions.invoke("queue-advance", { body: {} });
    await refreshQueueEntry();
    setIsSkippingToDriving(false);
  };

  if (loading || !driver) {
    return <LoadingScreen message="Scoping out the queue…" />;
  }

  const ownJeepney = driverPosition
    ? [{ id: "self", lat: driverPosition.lat, lng: driverPosition.lng, capacityState: "available" }]
    : [];

  return (
    <main className="next-to-go-page">
      <MapView
        jeepneys={ownJeepney}
        demandClusters={demand?.clusters ?? []}
        center={driverPosition ?? undefined}
        zoom={16}
      />

      <div className="next-to-go-page__top-bar">
        <span className="next-to-go-page__badge">NEXT TO GO</span>
        <span className="next-to-go-page__terminal-name">{driver.terminal?.name ?? "—"}</span>
      </div>

      <WaitOrGoCard
        data={demand}
        isLoading={isDemandLoading}
        error={demandError}
        onUseTerminalLocation={!driverPosition ? handleUseTerminalLocation : null}
        onSkipToDriving={handleSkipToDriving}
        isSkippingToDriving={isSkippingToDriving}
      />

      <NextToGoCard
        waitingCount={demand?.compatible_passenger_count ?? waitingCount}
        queuePosition={ownQueueEntry?.position ?? null}
        onWaitForMore={handleWaitForMore}
      />
    </main>
  );
}

export default NextToGoPage;
