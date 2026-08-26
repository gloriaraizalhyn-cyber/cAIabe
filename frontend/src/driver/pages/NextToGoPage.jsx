import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import NextToGoCard from "../components/NextToGoCard.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { fetchOwnQueueEntry } from "../utils/queue.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./NextToGoPage.css";

function NextToGoPage() {
  const navigate = useNavigate();
  const { driver, loading, session } = useDriverSession();
  const [ownQueueEntry, setOwnQueueEntry] = useState(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [driverPosition, setDriverPosition] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setDriverPosition({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const refreshQueueEntry = useCallback(async () => {
    if (!driver?.route?.id || !session?.user?.id) return;
    const entry = await fetchOwnQueueEntry(driver.route.id, session.user.id);
    setOwnQueueEntry(entry);
  }, [driver?.route?.id, session?.user?.id]);

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
  // by design — see schema.sql) so this count starts at 0 and only reflects
  // waiting-start/waiting-clear events broadcast while this page is open —
  // no historical backfill is possible.
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

  if (loading || !driver) {
    return (
      <main className="next-to-go-page">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="next-to-go-page">
      <MapView origin={driverPosition} center={driverPosition ?? undefined} zoom={16} />

      <div className="next-to-go-page__top-bar">
        <span className="next-to-go-page__badge">NEXT TO GO</span>
        <span className="next-to-go-page__terminal-name">{driver.terminal?.name ?? "—"}</span>
      </div>

      <NextToGoCard
        waitingCount={waitingCount}
        queuePosition={ownQueueEntry?.position ?? null}
        onWaitForMore={handleWaitForMore}
      />
    </main>
  );
}

export default NextToGoPage;
