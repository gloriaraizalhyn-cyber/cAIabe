// POST /functions/v1/nearby-jeepney-eta
// Body: { route_id: string, lat: number, lng: number }
// Returns: { etas: [{ driver_id, capacity_state, distance_meters, duration_seconds }] },
// sorted ascending by duration.
//
// Replaces the passenger-side straight-line/assumed-speed ETA guess with a
// real road-network lookup via Google's Routes API (computeRouteMatrix),
// using each currently-broadcasting driver's live position on this route as
// an origin and the passenger's own position as the single destination.
// The passenger's position is used only as an input to this call — it is
// never stored or broadcast (unlike waiting-start's fuzzed location).

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;

interface LatLng {
  lat: number;
  lng: number;
}

interface DriverPosition {
  driver_id: string;
  lat: number;
  lng: number;
  capacity_state: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { route_id, lat, lng } = await req.json() as { route_id: string; lat: number; lng: number };
    if (!route_id || lat === undefined || lng === undefined) {
      return json({ error: "route_id, lat, lng are required" }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("get_route_driver_positions", { p_route_id: route_id });
    if (error) return json({ error: error.message }, 500);

    const liveDrivers = (data ?? []) as DriverPosition[];
    if (!liveDrivers.length) return json({ etas: [] });

    const matrix = await computeRouteMatrix(
      liveDrivers.map((d) => ({ lat: d.lat, lng: d.lng })),
      { lat, lng },
    );

    const etas = liveDrivers
      .map((driver, originIndex) => {
        const cell = matrix.find((m) => m.originIndex === originIndex);
        if (!cell) return null;
        return {
          driver_id: driver.driver_id,
          capacity_state: driver.capacity_state,
          distance_meters: cell.distanceMeters,
          duration_seconds: cell.durationSeconds,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => a.duration_seconds - b.duration_seconds);

    return json({ etas });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// computeRouteMatrix requires an X-Goog-FieldMask header (unlike the legacy
// Directions/Distance Matrix APIs) — without it every field comes back
// empty rather than erroring, which is an easy thing to silently get wrong.
async function computeRouteMatrix(
  origins: LatLng[],
  destination: LatLng,
): Promise<{ originIndex: number; distanceMeters: number; durationSeconds: number }[]> {
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: origins.map((o) => ({
        waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      })),
      destinations: [
        { waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } } },
      ],
      travelMode: "DRIVE",
    }),
  });

  if (!res.ok) {
    console.error("computeRouteMatrix failed:", await res.text());
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((cell: any) => cell.condition === "ROUTE_EXISTS")
    .map((cell: any) => ({
      originIndex: cell.originIndex ?? 0,
      distanceMeters: cell.distanceMeters,
      durationSeconds: parseInt(String(cell.duration).replace("s", ""), 10),
    }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
