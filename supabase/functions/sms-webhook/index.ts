// POST /functions/v1/sms-webhook
// Inbound webhook target registered in TextBee's dashboard (Webhooks ->
// Add Webhook), NOT called by the frontend. Deployed with --no-verify-jwt
// since TextBee can't attach a Supabase JWT — authenticated instead via
// its own X-Signature HMAC-SHA256 header.
//
// Lets a passenger with no data connection text:
//   ROUTE <origin> to <destination>
// and get back up to 3 jeepney options, then reply 1/2/3 for step-by-step
// walk/board/transfer directions on the chosen one. Reuses the already-
// deployed route-search function for all scoring/traffic/transfer logic
// (called the same way FindRoutesPage.jsx does) rather than duplicating it.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { sendSms } from "../_shared/textbee.ts";
import { normalizePhMobileNumber } from "../_shared/phone.ts";
import { findLandmark, nearestLandmarkName, AmbiguousLandmarkError, type Landmark } from "../_shared/landmarks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TEXTBEE_WEBHOOK_SECRET");

const HELP_TEXT =
  "cAIabe: Text ROUTE <from> to <to> — e.g. ROUTE JENRA Grand Mall to Nepo Mall";
const NO_SESSION_TEXT =
  "cAIabe: No active route. Send: ROUTE <origin> to <destination>";
const NO_ROUTE_TEXT =
  "cAIabe: No route found. Try: ROUTE JENRA Grand Mall to Nepo Mall";
const SERVICE_UNAVAILABLE_TEXT =
  "cAIabe: Route service is temporarily unavailable. Please try again shortly.";

interface RouteSearchLeg {
  kind: "walk" | "jeep";
  from?: { lat: number; lng: number };
  to?: { lat: number; lng: number };
  color?: string;
}

interface RouteSearchResult {
  duration_min: number;
  fare: number | null;
  fare_before_discount: number | null;
  legs: RouteSearchLeg[];
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const rawBody = await req.text();

  if (!(await isValidSignature(req, rawBody))) {
    return json({ error: "invalid signature" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  // Delivery receipts / other event types — ack without acting, so TextBee
  // doesn't treat "we ignored this on purpose" as a failed delivery.
  // NOTE: TextBee's actual webhook payload is flat — "webhookEvent",
  // "sender", "message" all sit at the top level, not nested under "data"
  // with a field called "event" (verified against a real delivered
  // payload from TextBee's dashboard; their own docs describe the nested
  // shape, but that's not what they actually send).
  if (payload?.webhookEvent !== "MESSAGE_RECEIVED") {
    return json({ ok: true });
  }

  const sender: string | undefined = payload?.sender;
  const messageText: string | undefined = payload?.message;
  if (!sender || !messageText) return json({ ok: true });

  const phoneNumber = normalizePhMobileNumber(sender);
  if (!phoneNumber) return json({ ok: true }); // can't reply to a number we can't normalize

  const supabase = getServiceClient();
  const trimmed = messageText.trim();

  try {
    if (/^[123]$/.test(trimmed)) {
      await handleDirectionsRequest(supabase, phoneNumber, Number(trimmed));
    } else {
      const routeMatch = trimmed.match(/^route\s+(.+?)\s+to\s+(.+)$/i);
      if (routeMatch) {
        await handleRouteRequest(supabase, phoneNumber, routeMatch[1], routeMatch[2]);
      } else {
        await sendSms(supabase, null, phoneNumber, HELP_TEXT);
      }
    }
  } catch (err) {
    console.error("sms-webhook: failed to handle message:", err);
    // Best-effort reply on unexpected failure — never let this bubble into
    // a non-2xx, or TextBee will retry-hammer the webhook.
    await sendSms(supabase, null, phoneNumber, "cAIabe: something went wrong, please try again.").catch(() => {});
  }

  return json({ ok: true });
});

async function handleRouteRequest(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
  originText: string,
  destinationText: string,
) {
  // Resolved sequentially (not Promise.all) so an AmbiguousLandmarkError on
  // either side can be attributed to the right one for the reply.
  let origin: Landmark | null;
  try {
    origin = await findLandmark(supabase, originText);
  } catch (err) {
    if (err instanceof AmbiguousLandmarkError) {
      await sendSms(supabase, null, phoneNumber, ambiguousLandmarkReply(err));
      return;
    }
    throw err;
  }
  if (!origin) {
    await sendSms(supabase, null, phoneNumber, `cAIabe: Couldn't find "${originText.trim()}". Try a nearby terminal, mall, or landmark name.`);
    return;
  }

  let destination: Landmark | null;
  try {
    destination = await findLandmark(supabase, destinationText);
  } catch (err) {
    if (err instanceof AmbiguousLandmarkError) {
      await sendSms(supabase, null, phoneNumber, ambiguousLandmarkReply(err));
      return;
    }
    throw err;
  }
  if (!destination) {
    await sendSms(supabase, null, phoneNumber, `cAIabe: Couldn't find "${destinationText.trim()}". Try a nearby terminal, mall, or landmark name.`);
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/route-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
    }),
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    // 404 from route-search means "genuinely no route" — tell the passenger
    // plainly. Anything else (500/502 from a Google API hiccup, etc.) is a
    // backend problem, not a "no route exists" fact, so don't quote the raw
    // error text at the passenger; log it for us instead.
    if (res.status === 404) {
      await sendSms(supabase, null, phoneNumber, NO_ROUTE_TEXT);
    } else {
      console.error("sms-webhook: route-search failed:", res.status, data.error);
      await sendSms(supabase, null, phoneNumber, SERVICE_UNAVAILABLE_TEXT);
    }
    return;
  }

  const options: RouteSearchResult[] = [data.recommended, ...(data.alternatives ?? [])].slice(0, 3);

  await supabase.from("sms_sessions").upsert({
    phone_number: phoneNumber,
    origin,
    destination,
    search_result: { recommended: data.recommended, alternatives: data.alternatives ?? [] },
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  await sendSms(supabase, null, phoneNumber, formatOptionsReply(options));
}

async function handleDirectionsRequest(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
  choice: number,
) {
  const { data: session } = await supabase
    .from("sms_sessions")
    .select("origin, destination, search_result, expires_at")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    await sendSms(supabase, null, phoneNumber, NO_SESSION_TEXT);
    return;
  }

  const options: RouteSearchResult[] = [
    session.search_result.recommended,
    ...(session.search_result.alternatives ?? []),
  ];
  const picked = options[choice - 1];
  if (!picked) {
    await sendSms(supabase, null, phoneNumber, `cAIabe: Only ${options.length} option(s) were available — reply 1${options.length > 1 ? `-${options.length}` : ""}.`);
    return;
  }

  const directions = await formatDirectionsReply(supabase, picked, session.origin as Landmark, session.destination as Landmark);
  await sendSms(supabase, null, phoneNumber, directions);
}

function ambiguousLandmarkReply(err: AmbiguousLandmarkError): string {
  const options = err.candidates.slice(0, 3).join(", ");
  return `cAIabe: "${err.query}" matches multiple places (${options}). Please be more specific.`;
}

function formatOptionsReply(options: RouteSearchResult[]): string {
  const lines = ["cAIabe"];
  options.forEach((option, index) => {
    const colors = option.legs
      .filter((leg) => leg.kind === "jeep")
      .map((leg) => colorName(leg.color))
      .join("+");
    const fare = Math.round(option.fare ?? option.fare_before_discount ?? 0);
    const duration = Math.round(option.duration_min);
    const best = index === 0 ? " | BEST" : "";
    lines.push(`${index + 1}) ${colors} JP | ${duration}m | P${fare}${best}`);
  });
  const replyRange = options.length > 1 ? `1${options.length === 2 ? " or 2" : `, 2 or ${options.length}`}` : "1";
  lines.push(`Reply ${replyRange} for step-by-step directions.`);
  return lines.join("\n");
}

async function formatDirectionsReply(
  supabase: ReturnType<typeof getServiceClient>,
  option: RouteSearchResult,
  origin: Landmark,
  destination: Landmark,
): Promise<string> {
  const steps: string[] = [];

  for (let i = 0; i < option.legs.length; i++) {
    const leg = option.legs[i];
    if (leg.kind !== "walk") continue;

    const isFirst = i === 0;
    const isLast = i === option.legs.length - 1;
    const nextJeep = option.legs[i + 1];

    if (isFirst && nextJeep) {
      const name = (nextJeep.from && (await nearestLandmarkName(supabase, nextJeep.from))) ?? origin.label;
      steps.push(`WALK+BOARD: ${name} (${colorName(nextJeep.color)} JP)`);
    } else if (isLast) {
      steps.push(`GET OFF: ${destination.label}`);
    } else if (nextJeep) {
      const name = (leg.to && (await nearestLandmarkName(supabase, leg.to))) ?? "the transfer point";
      steps.push(`GET OFF+BOARD: ${name} (${colorName(nextJeep.color)} JP)`);
    }
  }

  if (!steps.length) return "cAIabe: No directions available for that option.";
  return steps.map((step, i) => `${i + 1}) ${step}`).join("\n");
}

// route-search's leg.color is either a plain word ("green") or a hex value
// ("#CB4747") depending on how the route was seeded — mirrors the same
// ambiguity adaptRouteSearchResult.js handles client-side. For hex values,
// approximate to the nearest name in a small fixed palette; good enough for
// an SMS summary, doesn't need to be pixel-perfect.
const COLOR_PALETTE: { name: string; r: number; g: number; b: number }[] = [
  { name: "WHITE", r: 255, g: 255, b: 255 },
  { name: "BLACK", r: 0, g: 0, b: 0 },
  { name: "GRAY", r: 128, g: 128, b: 128 },
  { name: "RED", r: 220, g: 38, b: 38 },
  { name: "BLUE", r: 37, g: 99, b: 235 },
  { name: "GREEN", r: 22, g: 163, b: 74 },
  { name: "EMERALD", r: 80, g: 200, b: 120 },
  { name: "YELLOW", r: 250, g: 204, b: 21 },
  { name: "ORANGE", r: 249, g: 115, b: 22 },
  { name: "PURPLE", r: 128, g: 0, b: 128 },
  { name: "PINK", r: 203, g: 71, b: 141 },
  { name: "BROWN", r: 146, g: 64, b: 14 },
  { name: "BEIGE", r: 225, g: 172, b: 125 },
  { name: "GOLD", r: 212, g: 175, b: 55 },
];

function colorName(color: string | undefined): string {
  if (!color) return "BLUE";
  if (!color.startsWith("#")) return color.toUpperCase();

  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "BLUE";

  let best = COLOR_PALETTE[0];
  let bestDistance = Infinity;
  for (const swatch of COLOR_PALETTE) {
    const distance = (r - swatch.r) ** 2 + (g - swatch.g) ** 2 + (b - swatch.b) ** 2;
    if (distance < bestDistance) {
      best = swatch;
      bestDistance = distance;
    }
  }
  return best.name;
}

async function isValidSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.error("sms-webhook: TEXTBEE_WEBHOOK_SECRET is not configured");
    return false;
  }

  const signature = req.headers.get("X-Signature") ?? req.headers.get("x-signature");
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
