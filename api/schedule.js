/**
 * Vercel serverless function — serves a live ICS calendar feed.
 * Requires FIREBASE_SERVICE_ACCOUNT env var (Firebase service account JSON for the dragonslo project).
 */
import { createSign } from 'node:crypto';

const PROJECT_ID = 'dragonslo';
const DAY_MAP = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
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
  return (await res.json()).access_token;
}

async function fsGet(path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return res.ok ? res.json() : null;
}

function strVal(f) { return f?.stringValue || ''; }
function boolVal(f) { return f?.booleanValue || false; }

function parseSlot(mapFields) {
  const f = mapFields || {};
  return {
    type:     strVal(f.type) || 'recurring',
    day:      strVal(f.day),
    date:     strVal(f.date),
    time:     strVal(f.time),
    location: strVal(f.location),
    focus:    strVal(f.focus),
    endDate:  strVal(f.endDate),
  };
}

function getUpcomingPracticeDates(slot, weeksAhead = 52) {
  const targetDay = DAY_MAP[slot.day];
  if (targetDay === undefined) return [];
  const today = new Date(); today.setHours(0,0,0,0);
  const current = new Date(today);
  const daysUntil = (targetDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + (daysUntil === 0 ? 0 : daysUntil));
  const endDate = slot.endDate ? new Date(slot.endDate + 'T23:59:59') : null;
  const dates = [];
  for (let i = 0; i < weeksAhead; i++) {
    if (endDate && current > endDate) break;
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function parseTimeStr(timeStr) {
  if (!timeStr) return null;
  const matches = [...timeStr.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)?/gi)];
  if (!matches.length) return null;
  const toH24 = (h, m, ap) => {
    let hour = parseInt(h);
    const ampm = (ap || 'PM').toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { h: hour, m: parseInt(m) };
  };
  const firstAP = matches[0][3] || 'PM';
  const start = toH24(matches[0][1], matches[0][2], matches[0][3] || firstAP);
  const end   = matches.length > 1
    ? toH24(matches[1][1], matches[1][2], matches[1][3] || firstAP)
    : { h: start.h + 2, m: start.m };
  return { startH: start.h, startM: start.m, endH: end.h, endM: end.m };
}

function icsDateTime(dateStr, h, m) {
  const d = dateStr.replace(/-/g, '');
  return `${d}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`;
}

function icsEscape(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function generateICS(games, practices) {
  const today = new Date().toISOString().split('T')[0];
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Dragons Baseball//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Dragons Baseball',
    'X-WR-CALDESC:Dragons Baseball Schedule',
    'X-PUBLISHED-TTL:PT6H',
  ];

  const allEvents = [
    ...games
      .filter(g => g.date >= today && !g.result && !g.cancelled && !g.postponed)
      .map(g => ({ ...g, evType: 'game' })),
    ...practices
      .filter(p => p.date >= today && !p.cancelled)
      .map(p => ({ ...p, evType: 'practice' })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  for (const ev of allEvents) {
    const times = parseTimeStr(ev.time);
    const ds = ev.date.replace(/-/g, '');
    const uid = ev.id ? `${ev.id}@dragons-baseball` : `${ev.evType}-${ds}@dragons-baseball`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (ev.evType === 'game') {
      lines.push(`SUMMARY:Dragons vs ${icsEscape(ev.opponent)}`);
      lines.push(`DESCRIPTION:${icsEscape(ev.homeAway || 'Home')} game vs ${icsEscape(ev.opponent)}`);
    } else {
      lines.push(`SUMMARY:Dragons Practice`);
      lines.push(`DESCRIPTION:${icsEscape(ev.focus || 'Practice')}`);
    }
    if (times) {
      lines.push(`DTSTART:${icsDateTime(ev.date, times.startH, times.startM)}`);
      lines.push(`DTEND:${icsDateTime(ev.date, times.endH, times.endM)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ds}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
    }
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

const EMPTY_ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dragons Baseball//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Dragons Baseball\r\nEND:VCALENDAR\r\n';

function sendICS(res, body) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(body);
}

export default async function handler(req, res) {
  const debug = req.query?.debug === '1';
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNTS || process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!saRaw) {
    if (debug) return res.status(200).json({ error: 'FIREBASE_SERVICE_ACCOUNT not set' });
    return sendICS(res, EMPTY_ICS);
  }

  try {
    const sa = JSON.parse(saRaw);
    const token = await getAccessToken(sa);

    // Fetch games (paginated) — always use the correct project ID
    const games = [];
    let pageToken = null;
    do {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/games?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const data = await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json();
      if (debug && data.error) return res.status(200).json({ error: 'Firestore games error', serviceAccountProject: sa.project_id, serviceAccountEmail: sa.client_email, details: data.error });
      for (const doc of data.documents || []) {
        const f = doc.fields || {};
        games.push({
          id:        doc.name.split('/').pop(),
          date:      strVal(f.date),
          opponent:  strVal(f.opponent),
          time:      strVal(f.time),
          location:  strVal(f.location),
          homeAway:  strVal(f.homeAway) || 'Home',
          cancelled: boolVal(f.cancelled),
          postponed: boolVal(f.postponed),
          result:    strVal(f.result),
        });
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    const practiceDoc  = await fsGet('settings/practiceSchedule', token);
    const cancelledDoc = await fsGet('settings/cancelledPractices', token);

    const cancelledSlots = {};
    if (cancelledDoc?.fields) {
      Object.entries(cancelledDoc.fields).forEach(([k, v]) => {
        cancelledSlots[k] = boolVal(v);
      });
    }

    const practiceSlots = practiceDoc?.fields?.practices?.arrayValue?.values || [];
    const practices = [];
    practiceSlots.forEach((slotVal, i) => {
      const slot = parseSlot(slotVal?.mapValue?.fields);
      const cancelled = !!cancelledSlots[i];
      if (slot.type === 'onetime') {
        if (slot.date) practices.push({ id: `practice-${i}-${slot.date}`, ...slot, cancelled });
      } else {
        getUpcomingPracticeDates(slot).forEach(date => {
          practices.push({ id: `practice-${i}-${date}`, ...slot, date, cancelled });
        });
      }
    });

    if (debug) {
      const today = new Date().toISOString().split('T')[0];
      const visibleGames = games.filter(g => g.date >= today && !g.result && !g.cancelled && !g.postponed);
      return res.status(200).json({
        ok: true,
        serverDate: today,
        serviceAccountProject: sa.project_id,
        totalGames: games.length,
        visibleGames: visibleGames.length,
        games: games.map(g => ({ id: g.id, date: g.date, opponent: g.opponent, result: g.result, cancelled: g.cancelled, postponed: g.postponed })),
        practices: practices.length,
      });
    }

    sendICS(res, generateICS(games, practices));
  } catch (err) {
    console.error('schedule.ics error:', err?.message || err);
    if (debug) return res.status(200).json({ error: err?.message || String(err) });
    sendICS(res, EMPTY_ICS);
  }
}
