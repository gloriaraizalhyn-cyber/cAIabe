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

const FUEL_PROFILES: Record<string, FuelProfile> = {
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

function idleLitersPerMinuteMidpoint(profile: FuelProfile): number {
  return (profile.idleLitersPerMinuteMin + profile.idleLitersPerMinuteMax) / 2;
}

export interface FuelEstimate {
  fuel_type: string;
  liters: number;
  cost: number;
}

// distanceKm covers the moving portion of the trip; trafficDelaySeconds is
// extra time spent idling/crawling beyond free-flow (0 for a plain
// distance-only estimate, e.g. the tricycle route comparison).
export function estimateFuelCost(
  vehicleType: string,
  distanceKm: number,
  trafficDelaySeconds = 0,
): FuelEstimate {
  const profile = FUEL_PROFILES[vehicleType] ?? FUEL_PROFILES.jeepney;
  const movingLiters = distanceKm / profile.kmPerLiter;
  const idleLiters = (Math.max(0, trafficDelaySeconds) / 60) * idleLitersPerMinuteMidpoint(profile);
  const liters = movingLiters + idleLiters;

  return {
    fuel_type: profile.fuelType,
    liters: round(liters),
    cost: round(liters * profile.pricePerLiter),
  };
}

export interface FuelRangeEstimate {
  fuel_type: string;
  min_liters: number;
  max_liters: number;
  min_cost: number;
  max_cost: number;
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
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
