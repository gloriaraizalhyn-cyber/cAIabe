import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
}

// Requests notification permission, registers the messaging service worker,
// and returns the device's FCM registration token — or null if messaging
// isn't supported/configured/permitted in this browser. Callers are
// expected to persist the token themselves (see useFcmRegistration).
export async function requestFcmToken() {
  if (!FIREBASE_CONFIG.apiKey || !VAPID_KEY) return null;
  if (!(await isSupported())) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(getFirebaseApp());

  try {
    return await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  } catch (err) {
    console.error("Failed to get FCM token:", err);
    return null;
  }
}
