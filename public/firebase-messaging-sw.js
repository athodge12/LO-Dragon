// Firebase background messaging service worker
// Uses compat CDN scripts — required in service workers (no ES module imports)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA-qE5_CAep-pyJWxG6S6cQpgEiOoXJ6WE",
  authDomain: "dragonslo.firebaseapp.com",
  projectId: "dragonslo",
  storageBucket: "dragonslo.firebasestorage.app",
  messagingSenderId: "78101830579",
  appId: "1:78101830579:web:d7c8d709d3e13bb80bc9c6",
});

const messaging = firebase.messaging();

// Handle background messages (app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Dragons Baseball';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: payload.data?.url || '/' },
  });
});

// On notification click, focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const match = wins.find(w => w.url.includes(self.location.origin));
      if (match) { match.focus(); match.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
