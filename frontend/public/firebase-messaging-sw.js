// Firebase Cloud Messaging background handler. Runs as a plain service
// worker (not bundled by Vite), so it can't read import.meta.env — the
// config values below have to be hardcoded. They're the same values as
// VITE_FIREBASE_* in frontend/.env.local, and are meant to be public (same
// posture as the Supabase anon key already used elsewhere in this app).
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "your-firebase-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id",
});

const messaging = firebase.messaging();

// Foreground messages are handled in firebaseMessaging.js via onMessage();
// this only fires for background/closed-tab notifications, which is what
// the FCM SDK requires a service worker for.
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  if (!title) return;
  self.registration.showNotification(title, { body, icon: "/favicon.ico" });
});
