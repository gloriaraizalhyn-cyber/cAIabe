// Firebase Cloud Messaging v1 helper (service-account OAuth2). The legacy
// "fcm.googleapis.com/fcm/send" + server-key API this replaced has been
// decommissioned by Google — v1 requires a short-lived OAuth2 access token
// signed with a service account, not a static key.
//
// Setup: put the FULL JSON contents of a Firebase service account key
// (Project Settings -> Service accounts -> Generate new private key) into
// the FIREBASE_SERVICE_ACCOUNT_JSON secret, as-is (one env var to manage).

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

// Cached across warm invocations of the same isolate so we're not signing a
// fresh JWT and round-tripping to Google on every single push.
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  return JSON.parse(raw) as ServiceAccount;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signJwt(serviceAccount: ServiceAccount): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${
    base64UrlEncodeString(JSON.stringify(claims))
  }`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const serviceAccount = getServiceAccount();

  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return { token: cachedAccessToken.token, projectId: serviceAccount.project_id };
  }

  const jwt = await signJwt(serviceAccount);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`FCM OAuth2 token exchange failed: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return { token: cachedAccessToken.token, projectId: serviceAccount.project_id };
}

export async function sendPushToToken(
  fcmToken: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<void> {
  if (!Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")) return; // no-op until configured

  const { token, projectId } = await getAccessToken();

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: { token: fcmToken, notification, ...(data ? { data } : {}) },
      }),
    },
  );

  if (!response.ok) {
    console.error("FCM v1 send failed:", await response.text());
  }
}
