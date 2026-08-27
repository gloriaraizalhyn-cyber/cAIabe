// TextBee SMS (https://textbee.dev) — turns an Android phone into the SMS
// gateway (free, prototype-friendly) rather than a paid carrier API. Used
// for two things: queue-advance's driver notification fallback, and
// sms-webhook's trip-planner replies.
//
// Every attempt is logged to sms_log (real or simulated) so the driver
// dashboard can show the fallback firing even without a live
// TextBee-connected phone — see sms_log's own comment in add_sms_log.sql.

import { getServiceClient } from "./client.ts";
import { normalizePhMobileNumber } from "./phone.ts";

const TEXTBEE_API_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

export async function sendSms(
  supabase: ReturnType<typeof getServiceClient>,
  driverId: string | null,
  mobileNumber: string,
  message: string,
): Promise<void> {
  const normalized = normalizePhMobileNumber(mobileNumber);
  if (!normalized) {
    console.error(`sendSms: "${mobileNumber}" is not a recognizable PH mobile number`);
    return;
  }

  const apiKey = Deno.env.get("TEXTBEE_API_KEY");

  if (!apiKey) {
    // No real gateway configured — log a simulated send so the fallback
    // path is demoable without a live TextBee-connected phone.
    await logSms(supabase, driverId, normalized, message, true);
    return;
  }

  const deviceId = Deno.env.get("TEXTBEE_DEVICE_ID"); // optional — defaults to your most recently active device

  const response = await fetch(TEXTBEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      recipients: [normalized],
      message,
      ...(deviceId ? { deviceId } : {}),
    }),
  });

  if (!response.ok) {
    console.error("TextBee SMS send failed:", await response.text());
    return; // don't log a send that didn't actually happen
  }

  await logSms(supabase, driverId, normalized, message, false);
}

async function logSms(
  supabase: ReturnType<typeof getServiceClient>,
  driverId: string | null,
  mobileNumber: string,
  message: string,
  simulated: boolean,
) {
  const { error } = await supabase
    .from("sms_log")
    .insert({ driver_id: driverId, mobile_number: mobileNumber, message, simulated });
  if (error) console.error("sendSms: failed to write sms_log:", error.message);
}
