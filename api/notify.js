/**
 * Vercel serverless function — sends FCM push notification to all registered devices.
 *
 * Required Vercel environment variables:
 *   FIREBASE_SERVICE_ACCOUNT  — contents of Firebase service account JSON
 *                               (Firebase Console → Project Settings → Service Accounts → Generate key)
 */
import { createSign } from 'node:crypto';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
  }));
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${header}.${payload}.${sig}`;

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  return data.access_token;
}

async function getFCMTokens(projectId, accessToken) {
  const tokens = [];
  let pageToken = null;

  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res  = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const data = await res.json();

    for (const docObj of data.documents || []) {
      const token = docObj.fields?.fcmToken?.stringValue;
      if (token) tokens.push(token);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return tokens;
}

async function sendFCM(token, title, body, projectId, accessToken, clickUrl) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: {
          notification: { icon: '/favicon.svg' },
          fcm_options: { link: clickUrl || '/' },
        },
      },
    }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' });

  const { title, body, url } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

  try {
    const sa = JSON.parse(saRaw);
    const accessToken = await getAccessToken(sa);
    const tokens = await getFCMTokens(sa.project_id, accessToken);

    let sent = 0;
    await Promise.allSettled(
      tokens.map(async (token) => {
        const ok = await sendFCM(token, title, body, sa.project_id, accessToken, url);
        if (ok) sent++;
      })
    );

    res.status(200).json({ sent, total: tokens.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send notifications' });
  }
}
