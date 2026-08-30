// TextBee SMS (https://textbee.dev) — turns an Android phone into the SMS
// gateway (free, prototype-friendly) rather than a paid carrier API. Used
// by sms-webhook to reply to the passenger SMS trip planner (a passenger
// with no data connection texts ROUTE <from> to <to> and gets jeepney
// directions back over plain SMS).
//
// Every attempt is logged to sms_log (real or simulated) so the fallback
// is demoable without a live TextBee-connected phone — see sms_log's own
// comment in add_sms_log.sql. driverId is kept nullable on that table for
// a possible future driver-facing use; the passenger flow always logs null.

import { getServiceClient } from "./client.ts";
import { normalizePhMobileNumber } from "./phone.ts";

const TEXTBEE_API_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

// Single-segment GSM SMS is 160 chars; concatenated multi-part SMS reserves
// space for a "(1/3) " style prefix. Chunking explicitly here (rather than
// trusting the gateway to split long text) means the simulated/demo path —
// which never actually calls TextBee — still exercises multi-message
// splitting the same way a real send would.
const SMS_MAX_LEN = 160;
const PART_PREFIX_RESERVE = 7; // enough for "(9/9) "

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
  const deviceId = Deno.env.get("TEXTBEE_DEVICE_ID"); // optional — defaults to your most recently active device

  for (const part of splitForSms(message)) {
    if (!apiKey) {
      // No real gateway configured — log a simulated send so the fallback
      // path is demoable without a live TextBee-connected phone.
      await logSms(supabase, driverId, normalized, part, true);
      continue;
    }

    const response = await fetch(TEXTBEE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        recipients: [normalized],
        message: part,
        ...(deviceId ? { deviceId } : {}),
      }),
    });

    if (!response.ok) {
      console.error("TextBee SMS send failed:", await response.text());
      continue; // don't log a send that didn't actually happen; still try the remaining parts
    }

    await logSms(supabase, driverId, normalized, part, false);
  }
}

// Splits on line breaks first (never mid-line unless a single line alone
// exceeds the budget) so a chunk boundary never lands in the middle of a
// direction step. Returns the original message unchanged as a single
// "part" when it already fits.
export function splitForSms(message: string, maxLen = SMS_MAX_LEN): string[] {
  const budget = Math.max(maxLen - PART_PREFIX_RESERVE, 20);
  const lines = message.split("\n");
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of lines) {
    let remaining = line;
    while (remaining.length > budget) {
      flush();
      chunks.push(remaining.slice(0, budget));
      remaining = remaining.slice(budget);
    }
    const candidate = current ? `${current}\n${remaining}` : remaining;
    if (candidate.length > budget) {
      flush();
      current = remaining;
    } else {
      current = candidate;
    }
  }
  flush();

  if (chunks.length <= 1) return [message];
  return chunks.map((chunk, i) => `(${i + 1}/${chunks.length}) ${chunk}`);
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
