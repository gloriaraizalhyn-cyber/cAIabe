import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { adaptRouteSearchResult } from "../../user/utils/adaptRouteSearchResult.js";
import { demoStageClient, signInDemoStageDriver } from "../lib/demoStageClient.js";
import { DEMO_SIM_DRIVER_PASSWORD } from "../DemoFrameBootstrap.jsx";
import {
  DEMO_JOURNEY,
  DEMO_ROUTES,
  DEMO_LEAD_ROUTE,
  DEMO_LEAD_TERMINAL,
  DEMO_PANE_DRIVER_UNIT,
  DEMO_SMS_PHONE,
  DEMO_SURGE_CLUSTERS,
  simDriverEmail,
} from "../constants/demoScript.js";

const DEMAND_POLL_MS = 15000;
const SMS_POLL_MS = 10000;

// Live jeepneys across BOTH demo routes, merged and tagged with each route's
// own colour so MapView renders the grey Balibago units and the yellow
// Telabastagan units distinctly (it reads jeep.color per marker).
//
// useLiveDriverPositions is per-route, so it's called once per route. That's
// only legal because DEMO_ROUTES has a fixed length — these are unconditional
// hook calls, not a loop over runtime-variable data.
function useDemoFleet() {
  const legOne = useLiveDriverPositions(DEMO_ROUTES[0].id);
  const legTwo = useLiveDriverPositions(DEMO_ROUTES[1].id);

  return useMemo(() => {
    const tag = (jeeps, route) =>
      jeeps.map((jeep) => ({ ...jeep, color: route.color, routeName: route.name, routeLeg: route.leg }));

    return {
      jeepneys: [...tag(legOne.jeepneys, DEMO_ROUTES[0]), ...tag(legTwo.jeepneys, DEMO_ROUTES[1])],
      isConnected: legOne.isConnected && legTwo.isConnected,
      countsByLeg: { 1: legOne.jeepneys.length, 2: legTwo.jeepneys.length },
    };
  }, [legOne.jeepneys, legTwo.jeepneys, legOne.isConnected, legTwo.isConnected]);
}

export function useDemoStage() {
  const fleet = useDemoFleet();

  const [journey, setJourney] = useState(null);
  const [journeyError, setJourneyError] = useState(null);
  const [stageDriver, setStageDriver] = useState({ status: "signing-in", id: null, error: null });
  const [demand, setDemand] = useState(null);
  const [smsThread, setSmsThread] = useState([]);
  const [activity, setActivity] = useState(null);

  // waiting_ids this stage created via the surge lever, so "clear" has
  // something real to act on — mirrors mock-passenger-simulator.js.
  const surgedWaitingIds = useRef([]);

  const leadDriverEmail = useMemo(
    () => simDriverEmail(DEMO_LEAD_ROUTE.name, DEMO_PANE_DRIVER_UNIT),
    []
  );

  const say = useCallback((message) => {
    setActivity({ message, at: Date.now() });
  }, []);

  // ---- plan the journey once, for the god map ----
  useEffect(() => {
    let isMounted = true;

    supabase.functions
      .invoke("route-search", {
        body: {
          origin: { lat: DEMO_JOURNEY.origin.lat, lng: DEMO_JOURNEY.origin.lng },
          destination: { lat: DEMO_JOURNEY.destination.lat, lng: DEMO_JOURNEY.destination.lng },
          discount_type: DEMO_JOURNEY.discountType,
        },
      })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error || data?.error || !data?.recommended) {
          setJourneyError(error?.message ?? data?.error ?? "route-search returned no itinerary.");
          return;
        }
        setJourney(adaptRouteSearchResult(data)[0] ?? null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ---- hold a driver session for the demand read + capacity lever ----
  useEffect(() => {
    let isMounted = true;

    signInDemoStageDriver(leadDriverEmail, DEMO_SIM_DRIVER_PASSWORD).then((result) => {
      if (!isMounted) return;
      setStageDriver(
        result.ok
          ? { status: "ready", id: result.session?.user?.id ?? null, error: null }
          : { status: "failed", id: null, error: result.error }
      );
    });

    return () => {
      isMounted = false;
    };
  }, [leadDriverEmail]);

  // ---- demand (waiting dots + clusters for the god map) ----
  //
  // Read from the terminal, because that is where the pane driver actually
  // is — it's parked, deciding whether to roll out, which is the question
  // WaitOrGoCard answers. A parked driver is deliberately invisible to
  // passengers (the next_to_go/driving gate), so its position can't be taken
  // from the live fleet stream; the terminal coordinate is the honest input.
  useEffect(() => {
    if (stageDriver.status !== "ready") return undefined;
    let isMounted = true;

    const read = async () => {
      const { data, error } = await demoStageClient.functions.invoke("driver-demand-check", {
        body: { lat: DEMO_LEAD_TERMINAL.lat, lng: DEMO_LEAD_TERMINAL.lng },
      });
      if (isMounted && !error && data) setDemand(data);
    };

    read();
    const timer = setInterval(read, DEMAND_POLL_MS);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [stageDriver.status]);

  // ---- SMS thread ----
  const refreshSms = useCallback(async () => {
    const { data } = await supabase.rpc("get_demo_sms_log", { p_phone: DEMO_SMS_PHONE });
    if (data) setSmsThread(data);
  }, []);

  useEffect(() => {
    refreshSms();
    const timer = setInterval(refreshSms, SMS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshSms]);

  // ---- levers ----

  // Places real waiting passengers through the same waiting-start a real
  // phone calls, positioned along the route's real polyline — so the driver
  // AI reads genuine demand, with waiting-start's own 80-150 m server-side
  // fuzzing spreading each cluster out naturally.
  const surge = useCallback(async () => {
    say("Placing waiting passengers…");
    let placed = 0;

    for (const cluster of DEMO_SURGE_CLUSTERS) {
      const { data: points } = await supabase.rpc("get_route_point_at_distance", {
        p_route_id: DEMO_LEAD_ROUTE.id,
        p_distance_meters: cluster.km * 1000,
      });
      const point = points?.[0];
      if (!point) continue;

      for (let i = 0; i < cluster.count; i += 1) {
        const { data } = await supabase.functions.invoke("waiting-start", {
          body: {
            route_id: DEMO_LEAD_ROUTE.id,
            lat: point.lat,
            lng: point.lng,
            discount_type: "regular",
          },
        });
        if (data?.waiting_id) {
          surgedWaitingIds.current.push(data.waiting_id);
          placed += 1;
        }
      }
    }

    say(`${placed} more passengers now waiting on the ${DEMO_LEAD_ROUTE.shortName} route.`);
  }, [say]);

  const clearDemand = useCallback(async () => {
    const ids = surgedWaitingIds.current.splice(0, surgedWaitingIds.current.length);
    if (!ids.length) {
      say("No surge passengers left to clear.");
      return;
    }
    say(`Clearing ${ids.length} waiting passengers…`);
    for (const waitingId of ids) {
      await supabase.functions.invoke("waiting-clear", { body: { waiting_id: waitingId } });
    }
    say("Cleared — they've boarded or moved on.");
  }, [say]);

  // Traffic has to go through the simulator: only the process holding that
  // unit's session can actually move it. Enqueued into demo_commands, which
  // mock-fleet-simulator.js polls once a second.
  const enqueue = useCallback(async (type, payload = {}) => {
    const { error } = await supabase.from("demo_commands").insert({ type, payload });
    if (error) say(`Could not send "${type}" — has add_demo_control.sql been run?`);
    return !error;
  }, [say]);

  // Target a MOVING unit on the boarding route — the pane driver is parked at
  // the terminal, so slowing it down would change nothing anyone can see.
  // Picking the closest one to the waiting passenger is also the unit whose
  // ETA the passenger screen is actually counting down.
  const trafficTarget = useMemo(
    () => fleet.jeepneys.find((jeep) => jeep.routeLeg === 1) ?? null,
    [fleet.jeepneys]
  );

  const throwTraffic = useCallback(async () => {
    if (!trafficTarget) {
      say("No moving unit on the boarding route yet — is the fleet simulator running?");
      return;
    }
    if (await enqueue("slow", { target: trafficTarget.id, route: DEMO_LEAD_ROUTE.name })) {
      say("Heavy traffic on that unit — it just fell back along its route.");
      return true;
    }
    return false;
  }, [enqueue, say, trafficTarget]);

  const clearTraffic = useCallback(async () => {
    if (!trafficTarget) return false;
    if (await enqueue("resume", { target: trafficTarget.id, route: DEMO_LEAD_ROUTE.name })) {
      say("Traffic cleared — back to normal speed.");
      return true;
    }
    return false;
  }, [enqueue, say, trafficTarget]);

  const idle = useCallback(async () => {
    if (!trafficTarget) {
      say("No moving unit on the boarding route yet — is the fleet simulator running?");
      return false;
    }
    if (await enqueue("idle", { target: trafficTarget.id, route: DEMO_LEAD_ROUTE.name })) {
      say("That unit is idling roadside — fuel waste is being measured.");
      return true;
    }
    return false;
  }, [enqueue, say, trafficTarget]);

  const resume = useCallback(async () => {
    if (!trafficTarget) return false;
    if (await enqueue("resume", { target: trafficTarget.id, route: DEMO_LEAD_ROUTE.name })) {
      say("That unit is moving again.");
      return true;
    }
    return false;
  }, [enqueue, say, trafficTarget]);

  const sendSms = useCallback(
    async (text) => {
      if (await enqueue("send_sms", { from: DEMO_SMS_PHONE, text })) {
        say(`Texted: "${text}"`);
        // The reply lands in sms_log a moment later, via the simulator.
        setTimeout(refreshSms, 2500);
      }
    },
    [enqueue, refreshSms, say]
  );

  return {
    journey,
    journeyError,
    fleet,
    demand,
    stageDriver,
    trafficTarget,
    smsThread,
    activity,
    levers: { surge, clearDemand, throwTraffic, clearTraffic, idle, resume, sendSms },
  };
}
