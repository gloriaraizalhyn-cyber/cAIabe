// Semaphore SMS fallback (https://semaphore.co) for drivers who miss the FCM
// push — no smartphone data connection at the moment, notifications
// disabled, token gone stale, etc. Mirrors fcm.ts's "no-op until configured"
// shape so this is safe to call even before SEMAPHORE_API_KEY is set.

const SEMAPHORE_API_URL = "https://api.semaphore.co/api/v4/messages";

export async function sendSms(mobileNumber: string, message: string): Promise<void> {
  const apiKey = Deno.env.get("SEMAPHORE_API_KEY");
  if (!apiKey) return; // no-op until configured

  const normalized = normalizePhMobileNumber(mobileNumber);
  if (!normalized) {
    console.error(`sendSms: "${mobileNumber}" is not a recognizable PH mobile number`);
    return;
  }

  const response = await fetch(SEMAPHORE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      number: normalized,
      message,
    }),
  });

  if (!response.ok) {
    console.error("Semaphore SMS send failed:", await response.text());
  }
}

// Semaphore expects the local 09XXXXXXXXX shape — normalize the +63/63
// forms the registration form's PH_MOBILE_NUMBER_PATTERN also accepts.
function normalizePhMobileNumber(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return "0" + digits.slice(3);
  if (/^639\d{9}$/.test(digits)) return "0" + digits.slice(2);
  return null;
}
