import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useDriverSession } from "../hooks/useDriverSession.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import QueueTurnAlert from "../components/QueueTurnAlert.jsx";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./DriverQueueListPage.css";

const STATUS_LABEL = {
  waiting: "Waiting",
  next_to_go: "Next to go",
};

function DriverQueueListPage() {
  const navigate = useNavigate();
  const { driver, session, loading } = useDriverSession();
  const [entries, setEntries] = useState([]);
  const [isResponding, setIsResponding] = useState(false);

  // Selects notified_at/responded_at/geofence_status too so the "lining up /
  // skip me" turn alert can show up right here — a driver's turn shouldn't
  // go unnoticed just because they're looking at the queue list instead of
  // the dashboard. Reuses this same already-fetched list rather than adding
  // a second parallel subscription for "just my own entry".
  const refreshQueue = useCallback(async () => {
    if (!driver?.route?.id) return;
    const { data } = await supabase
      .from("queue_entries")
      .select("id, driver_id, status, arrival_at, notified_at, responded_at, geofence_status")
      .eq("route_id", driver.route.id)
      .in("status", ["waiting", "next_to_go"])
      .order("arrival_at", { ascending: true });
    if (data) setEntries(data);
  }, [driver?.route?.id]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!driver?.route?.id) return undefined;
    const channel = supabase
      .channel(`route:${driver.route.id}:queue`)
      .on("broadcast", { event: "driver_notified" }, refreshQueue)
      .on("broadcast", { event: "queue_updated" }, refreshQueue)
      .on("broadcast", { event: "driver_departed" }, refreshQueue)
      .subscribe();

    const pollId = setInterval(refreshQueue, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [driver?.route?.id, refreshQueue]);

  const handleBack = () => navigate("/driver/dashboard");

  // Same three responses QueueTurnAlert triggers from the dashboard — see
  // driver-queue-respond for what each one actually does server-side.
  const handleLiningUp = async () => {
    setIsResponding(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "lining_up" } });
    setIsResponding(false);
    navigate("/driver/next-to-go");
  };

  const handleLeaveTemporarily = async () => {
    setIsResponding(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "skip_temp" } });
    await refreshQueue();
    setIsResponding(false);
  };

  const handleEndShiftForTheDay = async () => {
    setIsResponding(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "skip_done" } });
    setIsResponding(false);
    navigate("/driver/dashboard", { state: { shiftStage: "not_started" } });
  };

  if (loading || !driver) {
    return <LoadingScreen message="Counting jeepneys in line…" />;
  }

  const ownId = session?.user?.id;
  const ownIndex = entries.findIndex((entry) => entry.driver_id === ownId);
  const ownEntry = ownIndex === -1 ? null : entries[ownIndex];
  const showQueueTurnAlert = Boolean(ownEntry?.notified_at) && !ownEntry?.responded_at;

  return (
    <main className="driver-queue-list-page">
      <header className="driver-queue-list-page__header">
        <button type="button" className="driver-queue-list-page__back-button" onClick={handleBack}>
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>
        <div className="driver-queue-list-page__header-copy">
          <h1 className="driver-queue-list-page__title">Queue</h1>
          <p className="driver-queue-list-page__subtitle">{driver.route?.name ?? "Your route"}</p>
        </div>
      </header>

      <ol className="driver-queue-list-page__list">
        {entries.map((entry, index) => {
          const isOwn = entry.driver_id === ownId;
          return (
            <li
              key={entry.id}
              className={`driver-queue-list-page__item${isOwn ? " driver-queue-list-page__item--own" : ""}`}
            >
              <span className="driver-queue-list-page__position">#{index + 1}</span>
              <span className="driver-queue-list-page__name">
                {/* Stable per-driver label (not tied to queue position, which
                    reshuffles) — matches the short id the fleet simulator
                    prints in its own startup log, e.g. "🚐 [...] active
                    (ca577a15…)", so the two can be cross-referenced. */}
                {isOwn ? "You" : `Driver ${entry.driver_id.slice(0, 8)}`}
              </span>
              <span className="driver-queue-list-page__status">
                {STATUS_LABEL[entry.status] ?? entry.status}
              </span>
            </li>
          );
        })}
      </ol>

      {showQueueTurnAlert && (
        <QueueTurnAlert
          queuePosition={ownIndex === -1 ? null : ownIndex + 1}
          geofenceStatus={ownEntry?.geofence_status}
          isSubmitting={isResponding}
          onLiningUp={handleLiningUp}
          onLeaveTemporarily={handleLeaveTemporarily}
          onEndShiftForTheDay={handleEndShiftForTheDay}
        />
      )}
    </main>
  );
}

export default DriverQueueListPage;
