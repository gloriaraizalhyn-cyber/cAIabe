import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NextToGoMapCanvas from "../components/NextToGoMapCanvas.jsx";
import NextToGoCard from "../components/NextToGoCard.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import { fetchOwnQueuePosition } from "../utils/queue.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./NextToGoPage.css";

function NextToGoPage() {
  const navigate = useNavigate();
  const { driver, loading, session } = useDriverSession();
  const [queuePosition, setQueuePosition] = useState(null);
  const [waitingCount, setWaitingCount] = useState(0);

  const refreshQueuePosition = useCallback(async () => {
    if (!driver?.route?.id || !session?.user?.id) return;
    const position = await fetchOwnQueuePosition(driver.route.id, session.user.id);
    if (position !== null) setQueuePosition(position);
  }, [driver?.route?.id, session?.user?.id]);

  useEffect(() => {
    refreshQueuePosition();
  }, [refreshQueuePosition]);

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
      .on("broadcast", { event: "queue_updated" }, refreshQueuePosition)
      .on("broadcast", { event: "driver_departed" }, refreshQueuePosition)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(queueChannel);
    };
  }, [driver?.route?.id, refreshQueuePosition]);

  // "Wait for more" has no backend concept — staying on this page already
  // is the "wait" behavior, so this stays a no-op as it was before.
  const handleWaitForMore = () => {};
  const handleGoNow = () => {
    navigate("/driver/driving");
  };

  if (loading || !driver) {
    return <LoadingScreen message="Scoping out the queue…" />;
  }

  return (
    <main className="next-to-go-page">
      <NextToGoMapCanvas terminalName={driver.terminal?.name ?? "—"} waitingPassengers={[]} />
      <NextToGoCard
        waitingCount={waitingCount}
        queuePosition={queuePosition}
        onWaitForMore={handleWaitForMore}
        onGoNow={handleGoNow}
      />
    </main>
  );
}

export default NextToGoPage;
