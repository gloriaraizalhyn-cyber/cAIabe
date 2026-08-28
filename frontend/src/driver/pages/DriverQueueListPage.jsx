import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useDriverSession } from "../hooks/useDriverSession.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
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

  const refreshQueue = useCallback(async () => {
    if (!driver?.route?.id) return;
    const { data } = await supabase
      .from("queue_entries")
      .select("id, driver_id, status, arrival_at")
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
      .on("broadcast", { event: "queue_updated" }, refreshQueue)
      .on("broadcast", { event: "driver_departed" }, refreshQueue)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [driver?.route?.id, refreshQueue]);

  const handleBack = () => navigate("/driver/dashboard");

  if (loading || !driver) {
    return <LoadingScreen message="Counting jeepneys in line…" />;
  }

  const ownId = session?.user?.id;

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
                {isOwn ? "You" : `Unit #${index + 1}`}
              </span>
              <span className="driver-queue-list-page__status">
                {STATUS_LABEL[entry.status] ?? entry.status}
              </span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

export default DriverQueueListPage;
