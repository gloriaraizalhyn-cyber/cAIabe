// Shared fuel-cost estimation, used by driver-fuel-check (traffic-delay
// while still moving toward the terminus) and driver-demand-check (roadside
// idling — fully stopped, not moving at all) so every fuel figure in the
// app is priced the same way.
//
// Jeepney idle-burn rate and diesel price are sourced from: an idling
// jeepney engine burns approximately 1.2-1.8 L/hour, which at ~₱85/L diesel
// works out to about ₱1.70-₱2.55 wasted per minute. idleLitersPerMinuteMin/
// Max store that range directly (0.020-0.030 L/min); estimateFuelCost's
// single-point traffic-delay estimate uses the midpoint of the two
// (0.025 L/min — unchanged from the value previously hardcoded here, so
// driver-fuel-check's existing numbers don't drift), while
// estimateIdleFuelRange uses the true min/max for the roadside-idling
// feature's range display. The tricycle profile and both kmPerLiter
// (moving-distance consumption) figures remain rough Angeles-City-area
// assumptions for the pitch — same "placeholder, replace before relying on
// this for real money" status as fare_reference's seeded rates. Swap in
// real driver-reported figures later.
//
// CO2 is derived straight from liters burned, using the standard
// combustion emission factors (IPCC 2006 defaults): ~2.68 kg CO2 per liter
// of diesel and ~2.31 kg per liter of gasoline. That's pure chemistry
// (carbon in the fuel -> CO2 out the tailpipe), so it's the one figure here
// that's not an assumption — the liters it multiplies still are.
//
// Sourced overrides: every figure above except CO2 can be replaced by
// approved rows in fuel_factors (add_fuel_factors.sql), extracted from
// studies and DOE price reports by fuel-factors.js and checked by a person.
// Handlers call loadFuelFactors() once per request; the constants below
// stay as the fallback for any factor with no approved source.

import type { getServiceClient } from "./client.ts";

export interface FuelProfile {
  fuelType: string;
  pricePerLiter: number;
  kmPerLiter: number;
  // Liters burned per minute stationary/idling, on top of the
  // distance-based consumption above. A range, not a single figure — real
  // idle burn varies with load/AC/engine condition, so this is always
  // presented as "estimated."
  idleLitersPerMinuteMin: number;
  idleLitersPerMinuteMax: number;
}

const CO2_KG_PER_LITER: Record<string, number> = {
  diesel: 2.68,
  gasoline: 2.31,
};

// Fallbacks — also mirrored in add_carbon_impact.sql and
// add_driver_fuel_impact.sql; keep all three in sync.
const DEFAULT_FUEL_PROFILES: Record<string, FuelProfile> = {
  jeepney: {
    fuelType: "diesel",
    pricePerLiter: 85,
    kmPerLiter: 4,
    idleLitersPerMinuteMin: 0.02,
    idleLitersPerMinuteMax: 0.03,
  },
  tricycle: {
    fuelType: "gasoline",
    pricePerLiter: 65,
    kmPerLiter: 30,
    idleLitersPerMinuteMin: 0.01,
    idleLitersPerMinuteMax: 0.01,
  },
};
const DEFAULT_AVG_JEEPNEY_RIDERS = 12;
const DEFAULT_CAR_KM_PER_LITER = 10;

// Current figures: the defaults with any approved fuel_factors applied.
let FUEL_PROFILES: Record<string, FuelProfile> = structuredClone(DEFAULT_FUEL_PROFILES);
let ASSUMED_AVG_JEEPNEY_RIDERS = DEFAULT_AVG_JEEPNEY_RIDERS;
let ASSUMED_CAR_KM_PER_LITER = DEFAULT_CAR_KM_PER_LITER;

// ---------- sourced overrides (fuel_factors) ----------
// Cached per function instance: approvals are rare, and a factor check on
// every request would add a round trip to every driver poll.
const FACTOR_CACHE_MS = 10 * 60 * 1000;
let factorsLoadedAt = 0;

interface FuelFactorRow {
  subject: string;
  factor: string;
  value: number;
  min_value: number;
  max_value: number;
  source_count: number;
}

// Never throws: on any failure the previous figures (defaults, or the last
// good load) stay in place, so a fuel estimate is never blocked on this.
export async function loadFuelFactors(supabase: ReturnType<typeof getServiceClient>): Promise<void> {
  if (Date.now() - factorsLoadedAt < FACTOR_CACHE_MS) return;
  try {
    const { data, error } = await supabase.rpc("fuel_factor_summary");
    if (error) throw new Error(error.message);
    applyFuelFactors((data ?? []) as FuelFactorRow[]);
    factorsLoadedAt = Date.now();
  } catch (err) {
    console.error("loadFuelFactors failed, using previous fuel figures:", err);
  }
}

function applyFuelFactors(rows: FuelFactorRow[]) {
  const profiles = structuredClone(DEFAULT_FUEL_PROFILES);
  let riders = DEFAULT_AVG_JEEPNEY_RIDERS;
  let carKmPerLiter = DEFAULT_CAR_KM_PER_LITER;

  for (const row of rows) {
    const value = Number(row.value);
    if (!(value > 0)) continue;
    const key = `${row.subject}.${row.factor}`;

    if (key === "jeepney.avg_riders") riders = value;
    else if (key === "car.km_per_liter") carKmPerLiter = value;
    else if (row.factor === "km_per_liter" && profiles[row.subject]) {
      profiles[row.subject].kmPerLiter = value;
    } else if (row.factor === "idle_liters_per_hour" && profiles[row.subject]) {
      // Spread across sources becomes the displayed range; one source
      // collapses it to a single figure.
      profiles[row.subject].idleLitersPerMinuteMin = Number(row.min_value) / 60;
      profiles[row.subject].idleLitersPerMinuteMax = Number(row.max_value) / 60;
    } else if (row.factor === "price_per_liter") {
      // Priced per fuel, so it applies to every vehicle burning it.
      for (const profile of Object.values(profiles)) {
        if (profile.fuelType === row.subject) profile.pricePerLiter = value;
      }
    }
  }

  FUEL_PROFILES = profiles;
  ASSUMED_AVG_JEEPNEY_RIDERS = riders;
  ASSUMED_CAR_KM_PER_LITER = carKmPerLiter;
}

function idleLitersPerMinuteMidpoint(profile: FuelProfile): number {
  return (profile.idleLitersPerMinuteMin + profile.idleLitersPerMinuteMax) / 2;
}

export function co2KgForLiters(fuelType: string, liters: number): number {
  return liters * (CO2_KG_PER_LITER[fuelType] ?? CO2_KG_PER_LITER.diesel);
}

export interface FuelEstimate {
  fuel_type: string;
  liters: number;
  cost: number;
  co2_kg: number;
}

// distanceKm covers the moving portion of the trip; trafficDelaySeconds is
// extra time spent idling/crawling beyond free-flow (0 for a plain
// distance-only estimate, e.g. the tricycle route comparison).
export function estimateFuelCost(
  vehicleType: string,
  distanceKm: number,
  trafficDelaySeconds = 0,
  // The driver's own reported mileage (drivers.vehicle_km_per_liter); null /
  // undefined falls back to the profile's assumption.
  kmPerLiterOverride?: number | null,
): FuelEstimate {
  const profile = FUEL_PROFILES[vehicleType] ?? FUEL_PROFILES.jeepney;
  const kmPerLiter = kmPerLiterOverride && kmPerLiterOverride > 0 ? kmPerLiterOverride : profile.kmPerLiter;
  const movingLiters = distanceKm / kmPerLiter;
  const idleLiters = (Math.max(0, trafficDelaySeconds) / 60) * idleLitersPerMinuteMidpoint(profile);
  const liters = movingLiters + idleLiters;

  return {
    fuel_type: profile.fuelType,
    liters: round(liters),
    cost: round(liters * profile.pricePerLiter),
    co2_kg: round(co2KgForLiters(profile.fuelType, liters)),
  };
}

export interface FuelRangeEstimate {
  fuel_type: string;
  min_liters: number;
  max_liters: number;
  min_cost: number;
  max_cost: number;
  min_co2_kg: number;
  max_co2_kg: number;
}

// Roadside-idling estimate — vehicle fully stopped for `minutes`, priced as
// a range (not a fabricated single figure) using the profile's real min/max
// idle-burn rate. Always label this "Estimated" in the UI; it is not
// measured from any actual vehicle.
export function estimateIdleFuelRange(vehicleType: string, minutes: number): FuelRangeEstimate {
  const profile = FUEL_PROFILES[vehicleType] ?? FUEL_PROFILES.jeepney;
  const m = Math.max(0, minutes);
  const minLiters = m * profile.idleLitersPerMinuteMin;
  const maxLiters = m * profile.idleLitersPerMinuteMax;

  return {
    fuel_type: profile.fuelType,
    min_liters: round(minLiters),
    max_liters: round(maxLiters),
    min_cost: round(minLiters * profile.pricePerLiter),
    max_cost: round(maxLiters * profile.pricePerLiter),
    min_co2_kg: round(co2KgForLiters(profile.fuelType, minLiters)),
    max_co2_kg: round(co2KgForLiters(profile.fuelType, maxLiters)),
  };
}

// Midpoint idle burn for `minutes` stopped — the single figure the carbon
// impact log records per idling episode (the UI still shows the range).
export function estimateIdleFuelMidpoint(vehicleType: string, minutes: number): FuelEstimate {
  const profile = FUEL_PROFILES[vehicleType] ?? FUEL_PROFILES.jeepney;
  const liters = Math.max(0, minutes) * idleLitersPerMinuteMidpoint(profile);
  return {
    fuel_type: profile.fuelType,
    liters: round(liters),
    cost: round(liters * profile.pricePerLiter),
    co2_kg: round(co2KgForLiters(profile.fuelType, liters)),
  };
}

// ---------- per-rider trip carbon (passenger route search) ----------
//
// A jeepney's tailpipe CO2 is shared by everyone on board, so a rider's
// share is the vehicle's per-km CO2 divided by an assumed average load.
// Compared against the same distance driven alone in a typical small
// gasoline car. Both the load and the car's mileage are assumptions —
// always label the result "estimated" in the UI. The comparison uses only
// the jeepney ride distance (not the walk legs) for both sides, so the
// car figure is conservative: a car would also cover the walked stretches.
// (ASSUMED_AVG_JEEPNEY_RIDERS / ASSUMED_CAR_KM_PER_LITER are declared above,
// with the other sourced figures.)

export interface TripCarbonEstimate {
  ride_distance_km: number;
  jeepney_co2_kg: number;
  car_co2_kg: number;
  saved_co2_kg: number;
  assumed_jeepney_riders: number;
}

export function estimateTripCarbon(rideDistanceKm: number): TripCarbonEstimate {
  const km = Math.max(0, rideDistanceKm);
  const jeep = FUEL_PROFILES.jeepney;
  const jeepneyPerRider =
    co2KgForLiters(jeep.fuelType, km / jeep.kmPerLiter) / ASSUMED_AVG_JEEPNEY_RIDERS;
  const carSolo = co2KgForLiters("gasoline", km / ASSUMED_CAR_KM_PER_LITER);

  return {
    ride_distance_km: round(km),
    jeepney_co2_kg: round(jeepneyPerRider),
    car_co2_kg: round(carSolo),
    saved_co2_kg: round(Math.max(0, carSolo - jeepneyPerRider)),
    assumed_jeepney_riders: ASSUMED_AVG_JEEPNEY_RIDERS,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
