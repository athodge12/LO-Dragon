import { useEffect, useRef } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { messaging } from '../firebase/config';
import { db } from '../firebase/config';

/**
 * Requests notification permission and stores the FCM token in Firestore
 * under users/{uid}.fcmToken. Safe to call on every login — only runs once
 * per mount and only if permission hasn't been denied.
 *
 * Requires VITE_FIREBASE_VAPID_KEY in .env (or Vercel env variables):
 *   Firebase Console → Project Settings → Cloud Messaging → Web push certificates → Generate key pair
 */
export function useNotifications(currentUser) {
  const ran = useRef(false);

  useEffect(() => {
    if (!currentUser || ran.current) return;
    if (!('Notification' in window) || !messaging) return;
    ran.current = true;

    const run = async () => {
      try {
        let permission = Notification.permission;
        if (permission === 'denied') return;

        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') return;

        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) return; // key not configured yet — skip silently

        const token = await getToken(messaging, { vapidKey });
        if (token) {
          await setDoc(doc(db, 'users', currentUser.uid), { fcmToken: token }, { merge: true });
        }
      } catch {
        // Silently skip — notifications simply won't work on this device
      }
    };

    // Small delay so the permission dialog doesn't pop immediately on login
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [currentUser]);
}
