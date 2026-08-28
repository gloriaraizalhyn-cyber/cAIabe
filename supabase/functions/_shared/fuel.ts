// Shared fuel-cost estimation, used by driver-fuel-check for both vehicle
// types so the jeepney fixed-route warning and the tricycle route
// comparison price things the same way.
//
// Consumption/price constants below are rough Angeles-City-area assumptions
// for the pitch (diesel jeepney vs gasoline tricycle-motorcycle) — same
// "placeholder, replace before relying on this for real money" status as
// fare_reference's seeded rates. Swap in real driver-reported figures later.

export interface FuelProfile {
  fuelType: string;
  pricePerLiter: number;
  kmPerLiter: number;
  // Liters burned per minute stuck idling/crawling in traffic, on top of
  // the distance-based consumption above.
  idleLitersPerMinute: number;
}

const FUEL_PROFILES: Record<string, FuelProfile> = {
  jeepney: { fuelType: "diesel", pricePerLiter: 58, kmPerLiter: 4, idleLitersPerMinute: 0.03 },
  tricycle: { fuelType: "gasoline", pricePerLiter: 65, kmPerLiter: 30, idleLitersPerMinute: 0.01 },
};

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
  const idleLiters = (Math.max(0, trafficDelaySeconds) / 60) * profile.idleLitersPerMinute;
  const liters = movingLiters + idleLiters;

  return {
    fuel_type: profile.fuelType,
    liters: round(liters),
    cost: round(liters * profile.pricePerLiter),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
