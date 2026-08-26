const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class RouteSearchError extends Error {}

// Calls the deployed route-search Edge Function. Throws RouteSearchError
// with a user-facing message on any failure, including "no route serves
// this trip" (the function returns 404 for that case).
export async function searchRoutes({ origin, destination, discountType }) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new RouteSearchError(
      "Supabase isn't configured yet — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env.local."
    );
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/route-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        discount_type: discountType,
      }),
    });
  } catch {
    throw new RouteSearchError("Couldn't reach the server. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RouteSearchError(body?.error ?? `Route search failed (${response.status}).`);
  }

  return body; // { recommended, alternatives }
}
