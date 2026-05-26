importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC",
  authDomain: "liberte-club.firebaseapp.com",
  projectId: "liberte-club",
  storageBucket: "liberte-club.firebasestorage.app",
  messagingSenderId: "605225271131",
  appId: "1:605225271131:web:d03f217cfd9445a193e47e",
  measurementId: "G-HRKRV78XGS"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title || "Liberte Club", {
    body: payload.notification?.body || "Yeni bir bildirimin var.",
    icon: "/icon.svg",
    badge: "/icon.svg"
  });
});
