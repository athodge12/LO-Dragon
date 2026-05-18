import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import PracticeScheduleModal from '../Home/PracticeScheduleModal';

const DAY_MAP = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55'];

const selStyle = {
  padding: '9px 8px', borderRadius: '8px', border: '1.5px solid var(--gray-200)',
  background: 'white', fontSize: '14px', color: 'var(--black)', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none', textAlign: 'center'
};

function TimeRow({ label, hour, minute, ampm, onHour, onMinute, onAmPm }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '6px' }}>
        <select style={selStyle} value={hour} onChange={e => onHour(e.target.value)}>
          <option value="">Hr</option>
          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select style={selStyle} value={minute} onChange={e => onMinute(e.target.value)}>
          {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={selStyle} value={ampm} onChange={e => onAmPm(e.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

function buildTime(f) {
  const start = f.startHour ? `${f.startHour}:${f.startMinute} ${f.startAmPm}` : '';
  const end = f.endHour ? `${f.endHour}:${f.endMinute} ${f.endAmPm}` : '';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

function getUpcomingPracticeDates(slot, weeksAhead = 52) {
  const targetDay = DAY_MAP[slot.day];
  if (targetDay === undefined) return [];
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = new Date(today);
  const daysUntil = (targetDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + (daysUntil === 0 ? 0 : daysUntil));
  const endDate = slot.endDate ? new Date(slot.endDate + 'T23:59:59') : null;
  for (let i = 0; i < weeksAhead; i++) {
    if (endDate && current > endDate) break;
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

export default function Schedule() {
  const { isCoach, isBookkeeper, currentUser, userProfile } = useAuth();
  const canScore = isCoach || isBookkeeper;
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [games, setGames] = useState([]);
  const [practiceSchedule, setPracticeSchedule] = useState([]);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [modal, setModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editPracticeModal, setEditPracticeModal] = useState(null);
  const [editPracticeForm, setEditPracticeForm] = useState({});
  const [practiceModal, setPracticeModal] = useState(false);
  const [scoreModal, setScoreModal] = useState(null);
  const [toast, setToast] = useState('');
  const [showCalSync, setShowCalSync] = useState(false);
  const [form, setForm] = useState({ opponent: '', date: '', time: '', location: '', homeAway: 'Home' });
  const [score, setScore] = useState({ us: '', them: '', result: 'W' });
  const [rsvps, setRsvps] = useState({});
  const [gameWeather, setGameWeather] = useState({});

  useEffect(() => {
    const unsubs = [];

    const gamesQ = query(collection(db, 'games'), orderBy('date'));
    unsubs.push(onSnapshot(gamesQ, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'practiceSchedule'), snap => {
      if (snap.exists() && snap.data().practices) setPracticeSchedule(snap.data().practices);
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'cancelledPractices'), snap => {
      setCancelledSlots(snap.exists() ? snap.data() : {});
    }));

    if (currentUser) {
      unsubs.push(onSnapshot(collection(db, 'rsvps'), snap => {
        const userRsvps = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.userId === currentUser.uid) {
            if (data.gameId) userRsvps[data.gameId] = data.status;
            if (data.practiceId) userRsvps[data.practiceId] = data.status;
          }
        });
        setRsvps(userRsvps);
      }));
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser]);

  // Weather fetch for upcoming games within 7 days
  useEffect(() => {
    const wmoEmoji = (code) => {
      if (code === 0) return '☀️';
      if (code <= 3) return '🌤️';
      if (code <= 48) return '🌫️';
      if (code <= 67) return '🌧️';
      if (code <= 77) return '❄️';
      if (code <= 82) return '🌦️';
      return '⛈️';
    };

    const fetchWeather = async () => {
      const now = new Date();
      const sevenDays = new Date(now);
      sevenDays.setDate(sevenDays.getDate() + 7);
      const todayStr = now.toISOString().split('T')[0];
      const sevenStr = sevenDays.toISOString().split('T')[0];

      const upcoming = games.filter(g =>
        !g.result && !g.cancelled && g.location && g.date >= todayStr && g.date <= sevenStr
      );

      for (const game of upcoming) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(game.location)}&format=json&limit=1&email=app@dragonsbaseball.com`
          );
          const geoData = await geoRes.json();
          if (!geoData.length) continue;
          const { lat, lon } = geoData[0];

          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`
          );
          const wxData = await wxRes.json();
          const times = wxData.hourly?.time || [];
          const temps = wxData.hourly?.temperature_2m || [];
          const codes = wxData.hourly?.weathercode || [];

          // Find hour index closest to game time (default noon)
          const timeMatch = game.time ? game.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i) : null;
          let targetHour = 12;
          if (timeMatch) {
            let h = parseInt(timeMatch[1]);
            const ap = (timeMatch[3] || 'PM').toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
            targetHour = h;
          }
          const targetStr = `${game.date}T${String(targetHour).padStart(2,'0')}:00`;
          let bestIdx = 0;
          let bestDiff = Infinity;
          times.forEach((t, i) => {
            const diff = Math.abs(new Date(t) - new Date(targetStr));
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
          });

          const temp = temps[bestIdx];
          const code = codes[bestIdx];
          if (temp != null) {
            setGameWeather(w => ({ ...w, [game.id]: { temp: Math.round(temp), emoji: wmoEmoji(code) } }));
          }
        } catch {
          // silently skip on error
        }
      }
    };

    if (games.length) fetchWeather();
  }, [games]);

  // Build practice events from schedule (recurring + one-time)
  const practiceEvents = practiceSchedule.flatMap((slot, i) => {
    if (slot.type === 'onetime') {
      if (!slot.date) return [];
      return [{
        id: `practice-${i}-${slot.date}`,
        type: 'practice',
        date: slot.date,
        slotIndex: i,
        day: new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
        time: slot.time,
        location: slot.location,
        focus: slot.focus,
        cancelled: !!cancelledSlots[i],
        isOnetime: true
      }];
    }
    // Recurring
    return getUpcomingPracticeDates(slot).map(date => ({
      id: `practice-${i}-${date}`,
      type: 'practice',
      date,
      slotIndex: i,
      day: slot.day,
      time: slot.time,
      location: slot.location,
      focus: slot.focus,
      endDate: slot.endDate || null,
      cancelled: !!cancelledSlots[i]
    }));
  });

  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;

  const gameEvents = games.map(g => ({ ...g, type: 'game' }));

  const allEvents = [...gameEvents, ...practiceEvents]
    .filter(e => e.date >= today || !!e.postponed || (e.type === 'game' && !e.result && !e.cancelled && !e.postponed))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const pastPracticeEvents = practiceEvents
    .filter(e => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const completedGames = games.filter(g => g.result && g.date);
  const postponedGames = games.filter(g => g.postponed && !g.result && !g.cancelled);

  const visibleUpcoming = tab === 'all' ? allEvents
    : tab === 'games' ? allEvents.filter(e => e.type === 'game')
    : allEvents.filter(e => e.type === 'practice');

  const scheduleNextWeek = async (event) => {
    const nextDate = new Date(event.date + 'T12:00:00');
    nextDate.setDate(nextDate.getDate() + 7);
    const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;
    const slot = practiceSchedule[event.slotIndex] || {};
    const newSlot = {
      type: 'onetime',
      date: dateStr,
      time: event.time || '',
      location: event.location || '',
      focus: event.focus || '',
      startHour: slot.startHour || '',
      startMinute: slot.startMinute || '00',
      startAmPm: slot.startAmPm || 'PM',
      endHour: slot.endHour || '',
      endMinute: slot.endMinute || '00',
      endAmPm: slot.endAmPm || 'PM',
    };
    await setDoc(doc(db, 'settings', 'practiceSchedule'), { practices: [...practiceSchedule, newSlot] });
    setToast(`Practice scheduled for ${formatDate(dateStr)} ✅`);
  };

  const savePractices = async (data) => {
    await setDoc(doc(db, 'settings', 'practiceSchedule'), { practices: data });
    setToast('Practice schedule updated!');
    setPracticeModal(false);
  };

  const postponeGame = async (game) => {
    await setDoc(doc(db, 'games', game.id), { postponed: true }, { merge: true });
    setEditModal(null);
    setToast('Game marked as postponed — tap Reschedule to set a new date');
  };

  const addGame = async () => {
    if (!form.opponent || !form.date) return;
    await addDoc(collection(db, 'games'), { ...form, createdAt: new Date().toISOString() });
    setForm({ opponent: '', date: '', time: '', location: '', homeAway: 'Home' });
    setModal(null);
    setToast('Game added!');
  };

  const deleteGame = async (id) => {
    if (!window.confirm('Delete this game?')) return;
    await deleteDoc(doc(db, 'games', id));
    setEditModal(null);
    setToast('Game deleted');
  };

  const openEditGame = (game) => {
    setEditForm({ opponent: game.opponent, date: game.date, time: game.time || '', location: game.location || '', homeAway: game.homeAway || 'Home' });
    setEditModal(game);
  };

  const updateGame = async () => {
    if (!editModal) return;
    const updates = { ...editForm, postponed: false };
    if (editModal.postponed) updates.cancelled = false;
    await setDoc(doc(db, 'games', editModal.id), updates, { merge: true });
    setEditModal(null);
    setToast(editModal.postponed ? 'Game rescheduled! ✅' : 'Game updated!');
  };

  const toggleCancelGame = async (game) => {
    const cancelling = !game.cancelled;
    await setDoc(doc(db, 'games', game.id), { cancelled: cancelling }, { merge: true });
    setToast(cancelling ? 'Game cancelled' : 'Game restored');
    setEditModal(null);
    if (cancelling) {
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: '⚠️ Game Cancelled',
            body: `Dragons vs ${game.opponent} on ${game.date} has been cancelled.`,
            url: '/schedule',
          }),
        });
      } catch { /* silently skip */ }
    }
  };

  const openEditPractice = (event) => {
    const slot = practiceSchedule[event.slotIndex] || {};
    setEditPracticeForm({
      startHour: slot.startHour || '',
      startMinute: slot.startMinute || '00',
      startAmPm: slot.startAmPm || 'PM',
      endHour: slot.endHour || '',
      endMinute: slot.endMinute || '00',
      endAmPm: slot.endAmPm || 'PM',
      location: slot.location || '',
      focus: slot.focus || '',
      day: slot.day || '',
      endDate: slot.endDate || '',
      date: slot.date || '',
      type: slot.type || 'recurring'
    });
    setEditPracticeModal(event);
  };

  const updatePracticeSlot = async () => {
    if (!editPracticeModal) return;
    const time = buildTime(editPracticeForm);
    const updated = practiceSchedule.map((slot, i) =>
      i === editPracticeModal.slotIndex ? { ...slot, ...editPracticeForm, time } : slot
    );
    await setDoc(doc(db, 'settings', 'practiceSchedule'), { practices: updated });
    setEditPracticeModal(null);
    setToast('Practice updated!');
  };

  const toggleCancelPractice = async (slotIndex, cancelled) => {
    const updated = { ...cancelledSlots, [slotIndex]: !cancelled };
    await setDoc(doc(db, 'settings', 'cancelledPractices'), updated);
    setToast(cancelled ? 'Practice restored' : 'Practice cancelled');
    setEditPracticeModal(null);
  };

  const saveScore = async () => {
    if (!scoreModal) return;
    await setDoc(doc(db, 'games', scoreModal.id), {
      score: `${score.us}-${score.them}`,
      result: score.result
    }, { merge: true });
    setScoreModal(null);
    setToast('Score saved!');
  };

  const handleRsvp = async (gameId, status) => {
    const rsvpId = `${currentUser.uid}_${gameId}`;
    await setDoc(doc(db, 'rsvps', rsvpId), {
      userId: currentUser.uid,
      gameId,
      status,
      playerName: userProfile?.childName || `${userProfile?.firstName} ${userProfile?.lastName}`,
      updatedAt: new Date().toISOString()
    });
    setRsvps(r => ({ ...r, [gameId]: status }));
    setToast(`RSVP: ${status === 'yes' ? '✅ Going' : status === 'no' ? '❌ Not Going' : '🤔 Maybe'}`);
  };

  const handlePracticeRsvp = async (practiceId, status) => {
    const rsvpId = `${currentUser.uid}_${practiceId}`;
    await setDoc(doc(db, 'rsvps', rsvpId), {
      userId: currentUser.uid,
      practiceId,
      status,
      playerName: userProfile?.childName || `${userProfile?.firstName} ${userProfile?.lastName}`,
      updatedAt: new Date().toISOString()
    });
    setRsvps(r => ({ ...r, [practiceId]: status }));
    setToast(`RSVP: ${status === 'yes' ? '✅ Going' : status === 'no' ? '❌ Not Going' : '🤔 Maybe'}`);
  };

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  // ── Calendar sync helpers ──────────────────────────────────────
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

  function generateICS() {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//Dragons Baseball//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Dragons Baseball',
      'X-WR-CALDESC:Dragons Baseball games and practices',
    ];
    const upcoming = allEvents.filter(e => !e.cancelled && !e.postponed);
    for (const ev of upcoming) {
      const times = parseTimeStr(ev.time);
      const ds = ev.date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}@dragons-baseball`);
      if (ev.type === 'game') {
        lines.push(`SUMMARY:Dragons vs ${ev.opponent}`);
        lines.push(`DESCRIPTION:${ev.homeAway || 'Home'} game vs ${ev.opponent}`);
      } else {
        lines.push(`SUMMARY:Dragons Practice`);
        lines.push(`DESCRIPTION:${ev.focus || 'Practice'}`);
      }
      if (times) {
        lines.push(`DTSTART:${icsDateTime(ev.date, times.startH, times.startM)}`);
        lines.push(`DTEND:${icsDateTime(ev.date, times.endH, times.endM)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${ds}`);
        lines.push(`DTEND;VALUE=DATE:${ds}`);
      }
      if (ev.location) lines.push(`LOCATION:${ev.location.replace(/[,;\\]/g, s => '\\' + s)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  async function downloadICS() {
    const content = generateICS();
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });

    // iOS 15+: share the actual file so the user gets the native share sheet
    if (navigator.canShare) {
      const file = new File([blob], 'dragons-baseball.ics', { type: 'text/calendar' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Dragons Baseball Schedule' });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
          // fall through to anchor download
        }
      }
    }

    // Desktop / Android fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dragons-baseball.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function generateTextSchedule() {
    const upcoming = allEvents.filter(e => !e.cancelled && !e.postponed);
    const lines = ['🐉 Dragons Baseball Schedule', ''];
    upcoming.forEach(e => {
      const dateObj = new Date(e.date + 'T12:00:00');
      const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (e.type === 'game') {
        lines.push(`⚾ ${dateStr} — vs ${e.opponent}${e.homeAway ? ` (${e.homeAway})` : ''}`);
      } else {
        lines.push(`🏋️ ${dateStr} — Practice${e.focus ? ` (${e.focus})` : ''}`);
      }
      if (e.time) lines.push(`   🕐 ${e.time}`);
      if (e.location) lines.push(`   📍 ${e.location}`);
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  async function copySchedule() {
    const text = generateTextSchedule();
    try {
      await navigator.clipboard.writeText(text);
      setToast('Schedule copied! Paste anywhere to share.');
      setShowCalSync(false);
    } catch {
      setToast('Could not copy — try the Download option instead.');
    }
  }

  async function shareSchedule() {
    const text = generateTextSchedule();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Dragons Baseball Schedule', text, url: window.location.href });
        setShowCalSync(false);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          copySchedule();
        }
      }
    } else {
      copySchedule();
    }
  }

  function googleCalUrl(ev) {
    const times = parseTimeStr(ev.time);
    const ds = (ev.date || '').replace(/-/g, '');
    const dates = times
      ? `${icsDateTime(ev.date, times.startH, times.startM)}/${icsDateTime(ev.date, times.endH, times.endM)}`
      : `${ds}/${ds}`;
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.type === 'game' ? `Dragons vs ${ev.opponent}` : 'Dragons Practice',
      dates,
      details: ev.type === 'game' ? `${ev.homeAway || 'Home'} game` : (ev.focus || 'Practice'),
      location: ev.location || '',
    });
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  }
  // ──────────────────────────────────────────────────────────────

  const DateBadge = ({ date, result, postponed }) => {
    const dateObj = date ? new Date(date + 'T12:00:00') : null;
    const bg = result ? (result === 'W' ? '#DCFCE7' : '#FEE2E2') : postponed ? '#FEF3C7' : 'var(--red)';
    const fg = result ? (result === 'W' ? '#16A34A' : '#B91C1C') : postponed ? '#92400E' : 'white';
    return (
      <div style={{
        background: bg, color: fg,
        borderRadius: '10px', padding: '6px 10px', textAlign: 'center', minWidth: '52px', flexShrink: 0
      }}>
        <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>
          {dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short' }) : '—'}
        </div>
        <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
          {dateObj ? dateObj.getDate() : '—'}
        </div>
        {result && <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'Oswald, sans-serif' }}>{result}</div>}
      </div>
    );
  };

  const GameCard = ({ game, isPast }) => {
    const myRsvp = rsvps[game.id];
    const isActuallyPast = game.date < today;
    const needsReschedule = isActuallyPast && !game.result && !game.cancelled && !game.postponed;
    return (
      <div className="card" style={{
        marginBottom: '10px',
        opacity: game.cancelled ? 0.6 : 1,
        border: game.postponed && !game.cancelled ? '1px solid #FDE68A' : game.cancelled ? '1px solid #FECACA' : needsReschedule ? '1px solid #FDE68A' : isPast ? '1px solid var(--gray-200)' : undefined,
        background: game.postponed && !game.cancelled ? '#FFFBEB' : game.cancelled ? '#FFF5F5' : needsReschedule ? '#FFFBEB' : isPast ? 'var(--gray-50)' : undefined
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <DateBadge date={game.date} result={game.result} postponed={game.postponed && !game.cancelled} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '700', fontSize: '16px', textDecoration: game.cancelled ? 'line-through' : 'none' }}>vs {game.opponent}</span>
              {game.cancelled ? (
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', background: '#FEE2E2', color: '#B91C1C' }}>Cancelled</span>
              ) : game.postponed ? (
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', background: '#FEF3C7', color: '#92400E' }}>🔄 Postponed</span>
              ) : needsReschedule ? (
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', background: '#FEF3C7', color: '#92400E' }}>⚠️ Not Played</span>
              ) : (
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
                  background: game.homeAway === 'Home' ? '#DCFCE7' : '#DBEAFE',
                  color: game.homeAway === 'Home' ? '#16A34A' : '#2563EB'
                }}>{game.homeAway || 'Home'}</span>
              )}
              {game.score && (
                <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '15px', color: 'var(--gray-700)' }}>
                  {typeof game.score === 'object' ? `${game.score.us}-${game.score.them}` : game.score}
                </span>
              )}
            </div>
            {game.time && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px', textDecoration: game.cancelled ? 'line-through' : 'none' }}>{game.time}</div>}
            {game.location && !game.cancelled && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>📍 {game.location}</div>}
            {gameWeather[game.id] && !game.cancelled && !game.result && (
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                {gameWeather[game.id].emoji} {gameWeather[game.id].temp}°F
              </div>
            )}
            {!game.result && !game.cancelled && !isActuallyPast && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                {[
                  { key: 'yes', label: '✅ Going' },
                  { key: 'no', label: '❌ No' },
                  { key: 'maybe', label: '🤔 Maybe' }
                ].map(opt => (
                  <button key={opt.key} className={`rsvp-btn ${opt.key} ${myRsvp === opt.key ? 'active' : ''}`}
                    onClick={() => handleRsvp(game.id, opt.key)}>{opt.label}</button>
                ))}
              </div>
            )}
            {canScore && !game.result && !game.cancelled && !game.postponed && !isActuallyPast && (
              <div style={{ marginTop: '8px' }}>
                <button onClick={() => navigate('/live-scoring', { state: { gameToLoad: game } })} style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none',
                  background: 'var(--red)', color: 'white',
                  fontSize: '12px', fontWeight: '700', cursor: 'pointer'
                }}>⚾ Game Day</button>
              </div>
            )}
            {isCoach && needsReschedule && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button onClick={() => postponeGame(game)} style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none',
                  background: '#FEF3C7', color: '#92400E',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                }}>🔄 Mark for Reschedule</button>
              </div>
            )}
            {isPast && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button onClick={() => navigate('/stats')} style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none',
                  background: '#FEF2F2', color: 'var(--red)',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                }}>📊 View Stats</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
            {!game.cancelled && !game.postponed && !isActuallyPast && (
              <a href={googleCalUrl(game)} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" style={{
                background: 'var(--gray-100)', border: 'none', borderRadius: '6px',
                padding: '4px 8px', fontSize: '13px', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block'
              }}>📅</a>
            )}
            {canScore && !game.result && !game.cancelled && !game.postponed && !isActuallyPast && (
              <button onClick={() => { setScoreModal(game); setScore({ us: '', them: '', result: 'W' }); }} style={{
                background: 'var(--gray-100)', border: 'none', borderRadius: '6px',
                padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', color: 'var(--gray-600)'
              }}>Score</button>
            )}
            {isCoach && game.postponed && !game.cancelled && (
              <button onClick={() => openEditGame(game)} style={{
                background: '#FEF3C7', border: 'none', borderRadius: '6px',
                padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '700', color: '#92400E'
              }}>📅 Reschedule</button>
            )}
            {isCoach && (
              <button onClick={() => openEditGame(game)} style={{
                background: 'var(--gray-100)', border: 'none', borderRadius: '6px',
                padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', color: 'var(--gray-600)'
              }}>Edit</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const PracticeCard = ({ event, isPast }) => {
    const myRsvp = rsvps[event.id];
    return (
      <div className="card" style={{
        marginBottom: '10px',
        opacity: event.cancelled ? 0.6 : 1,
        border: event.cancelled ? '1px solid #FECACA' : isPast ? '1px solid var(--gray-200)' : undefined,
        background: event.cancelled ? '#FFF5F5' : isPast ? 'var(--gray-50)' : undefined
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{
            background: event.cancelled ? '#FEE2E2' : '#EDE9FE',
            color: event.cancelled ? '#B91C1C' : '#7C3AED',
            borderRadius: '10px', padding: '6px 10px', textAlign: 'center', minWidth: '52px', flexShrink: 0
          }}>
            <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>
              {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
              {new Date(event.date + 'T12:00:00').getDate()}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '700', fontSize: '15px', textDecoration: event.cancelled ? 'line-through' : 'none' }}>Practice</span>
              <span style={{
                fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
                background: event.isOnetime ? '#DBEAFE' : '#EDE9FE',
                color: event.isOnetime ? '#1D4ED8' : '#7C3AED'
              }}>{event.isOnetime ? '📅' : '🔁'} {event.day}</span>
              {event.cancelled && (
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
                  background: '#FEE2E2', color: '#B91C1C'
                }}>Cancelled</span>
              )}
            </div>
            {event.time && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px', textDecoration: event.cancelled ? 'line-through' : 'none' }}>{event.time}</div>}
            {event.location && !event.cancelled && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>📍 {event.location}</div>}
            {event.focus && !event.cancelled && <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: '600', marginTop: '2px' }}>{event.focus}</div>}
            {!event.cancelled && !isPast && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {[
                  { key: 'yes', label: '✅ Going' },
                  { key: 'no', label: '❌ No' },
                  { key: 'maybe', label: '🤔 Maybe' }
                ].map(opt => (
                  <button key={opt.key} className={`rsvp-btn ${opt.key} ${myRsvp === opt.key ? 'active' : ''}`}
                    onClick={() => handlePracticeRsvp(event.id, opt.key)}>{opt.label}</button>
                ))}
              </div>
            )}
            {isPast && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button onClick={() => {
                  sessionStorage.setItem('openPracticeDate', event.date);
                  navigate('/stats');
                }} style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none',
                  background: '#EDE9FE', color: '#7C3AED',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                }}>📊 View Stats</button>
                {isCoach && (
                  <button onClick={() => scheduleNextWeek(event)} style={{
                    padding: '5px 10px', borderRadius: '8px', border: 'none',
                    background: '#DCFCE7', color: '#16A34A',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                  }}>📅 Schedule Next Week</button>
                )}
              </div>
            )}
          </div>
          {isCoach && !isPast && (
            <button onClick={() => openEditPractice(event)} style={{
              background: 'var(--gray-100)', border: 'none', borderRadius: '6px',
              padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', color: 'var(--gray-600)', flexShrink: 0
            }}>Edit</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Schedule" actions={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowCalSync(true)} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
            padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px'
          }}>Export</button>
          {isCoach && (
            <button onClick={() => setPracticeModal(true)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
              padding: '0 10px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '700'
            }}>✏️ Practice</button>
          )}
          {isCoach && (
            <button onClick={() => setModal(true)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', cursor: 'pointer'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      } />

      <div className="page-content">
        <div className="tabs" style={{ marginBottom: '14px' }}>
          <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
          <button className={`tab ${tab === 'games' ? 'active' : ''}`} onClick={() => setTab('games')}>Games</button>
          <button className={`tab ${tab === 'practices' ? 'active' : ''}`} onClick={() => setTab('practices')}>Practices</button>
        </div>

        {isCoach && postponedGames.length > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px', flexShrink: 0 }}>🔄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#92400E' }}>
                {postponedGames.length} game{postponedGames.length > 1 ? 's' : ''} need{postponedGames.length === 1 ? 's' : ''} rescheduling
              </div>
              <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                {postponedGames.map(g => `vs ${g.opponent}`).join(' · ')} — tap Reschedule to set a new date
              </div>
            </div>
          </div>
        )}

        {!isCoach && tab !== 'practices' && (
          <div className="view-only-banner">Tap Yes / No / Maybe to RSVP to each game</div>
        )}

        {isCoach && tab === 'practices' && (
          <button onClick={() => setPracticeModal(true)} style={{
            width: '100%', padding: '11px', marginBottom: '14px',
            border: '1.5px solid #7C3AED', borderRadius: '10px',
            background: '#EDE9FE', color: '#7C3AED',
            fontWeight: '700', fontSize: '14px', cursor: 'pointer'
          }}>
            ✏️ Edit Practice Schedule
          </button>
        )}

        {/* Upcoming events */}
        {visibleUpcoming.length > 0 ? (
          <>
            <div className="section-header" style={{ marginBottom: '10px' }}>
              <span className="section-title">Upcoming ({visibleUpcoming.length})</span>
            </div>
            {visibleUpcoming.map(e =>
              e.type === 'game'
                ? <GameCard key={e.id} game={e} />
                : <PracticeCard key={e.id} event={e} />
            )}
          </>
        ) : (
          <div className="empty-state">
            <p style={{ fontSize: '32px' }}>📅</p>
            <p>Nothing upcoming</p>
            {isCoach && tab !== 'practices' && <p style={{ marginTop: '8px', color: 'var(--red)', fontWeight: '600' }}>Tap + to add a game</p>}
          </div>
        )}

        {/* Past games */}
        {tab !== 'practices' && completedGames.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: '16px', marginBottom: '10px' }}>
              <span className="section-title">Past Games ({completedGames.length})</span>
            </div>
            {completedGames.map(g => <GameCard key={g.id} game={{ ...g, type: 'game' }} isPast />)}
          </>
        )}

        {/* Past practices */}
        {tab !== 'games' && pastPracticeEvents.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: '16px', marginBottom: '10px' }}>
              <span className="section-title">Past Practices ({pastPracticeEvents.length})</span>
            </div>
            {pastPracticeEvents.map(e => <PracticeCard key={e.id} event={e} isPast />)}
          </>
        )}
      </div>

      {/* Add Game Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>Add Game</h3>
            <div className="form-group">
              <label className="form-label">Opponent</label>
              <input className="form-input" value={form.opponent} onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))} placeholder="Team name" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Time</label>
                <input className="form-input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} placeholder="5:30 PM" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Field name / address" />
            </div>
            <div className="form-group">
              <label className="form-label">Home / Away</label>
              <select className="form-select" value={form.homeAway} onChange={e => setForm(f => ({ ...f, homeAway: e.target.value }))}>
                <option value="Home">Home</option>
                <option value="Away">Away</option>
              </select>
            </div>
            <button className="btn-primary" onClick={addGame}>Add Game</button>
          </div>
        </div>
      )}

      {/* Score Modal */}
      {scoreModal && (
        <div className="modal-overlay" onClick={() => setScoreModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setScoreModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Record Score
            </h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '16px' }}>vs {scoreModal.opponent}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Dragons</label>
                <input className="form-input" type="number" value={score.us} onChange={e => setScore(s => ({ ...s, us: e.target.value }))} placeholder="0" min="0" style={{ textAlign: 'center', fontSize: '20px', fontFamily: 'Oswald, sans-serif' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{scoreModal.opponent}</label>
                <input className="form-input" type="number" value={score.them} onChange={e => setScore(s => ({ ...s, them: e.target.value }))} placeholder="0" min="0" style={{ textAlign: 'center', fontSize: '20px', fontFamily: 'Oswald, sans-serif' }} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Result</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['W', 'L', 'T'].map(r => (
                  <button key={r} onClick={() => setScore(s => ({ ...s, result: r }))} style={{
                    flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700',
                    fontFamily: 'Oswald, sans-serif', fontSize: '16px',
                    border: `2px solid ${score.result === r ? 'var(--red)' : 'var(--gray-200)'}`,
                    background: score.result === r ? '#FEF2F2' : 'white',
                    color: score.result === r ? 'var(--red)' : 'var(--gray-500)'
                  }}>{r === 'W' ? '🏆 Win' : r === 'L' ? '😤 Loss' : '🤝 Tie'}</button>
                ))}
              </div>
            </div>
            <button className="btn-primary" onClick={saveScore}>Save Score</button>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {editModal && isCoach && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Edit Game</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>vs {editModal.opponent}</p>
            <div className="form-group">
              <label className="form-label">Opponent</label>
              <input className="form-input" value={editForm.opponent} onChange={e => setEditForm(f => ({ ...f, opponent: e.target.value }))} placeholder="Team name" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Time</label>
                <input className="form-input" value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} placeholder="5:30 PM" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Location</label>
              <input className="form-input" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="Field name / address" />
            </div>
            <div className="form-group">
              <label className="form-label">Home / Away</label>
              <select className="form-select" value={editForm.homeAway} onChange={e => setEditForm(f => ({ ...f, homeAway: e.target.value }))}>
                <option value="Home">Home</option>
                <option value="Away">Away</option>
              </select>
            </div>
            {editModal.postponed && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '13px', color: '#92400E', fontWeight: '600' }}>
                🔄 This game is postponed — update the date above and tap Save to reschedule it.
              </div>
            )}
            <button className="btn-primary" onClick={updateGame}>
              {editModal.postponed ? '📅 Save & Reschedule' : 'Save Changes'}
            </button>
            {!editModal.result && !editModal.postponed && (
              <button onClick={() => postponeGame(editModal)} style={{
                width: '100%', marginTop: '8px', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                fontWeight: '700', fontSize: '15px', border: 'none',
                background: '#FEF3C7', color: '#92400E'
              }}>🔄 Postpone (Reschedule Later)</button>
            )}
            <button onClick={() => toggleCancelGame(editModal)} style={{
              width: '100%', marginTop: '8px', padding: '12px', borderRadius: '10px', cursor: 'pointer',
              fontWeight: '700', fontSize: '15px', border: 'none',
              background: editModal.cancelled ? '#DCFCE7' : '#FEE2E2',
              color: editModal.cancelled ? '#16A34A' : '#B91C1C'
            }}>{editModal.cancelled ? 'Restore Game' : 'Cancel Game'}</button>
            <button className="btn-secondary" onClick={() => deleteGame(editModal.id)} style={{ marginTop: '8px', color: 'var(--red)' }}>
              Delete Game
            </button>
          </div>
        </div>
      )}

      {/* Edit Practice Modal */}
      {editPracticeModal && isCoach && (
        <div className="modal-overlay" onClick={() => setEditPracticeModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setEditPracticeModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Edit Practice</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              {editPracticeModal.day} · {new Date(editPracticeModal.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>

            {editPracticeForm.type === 'recurring' ? (
              <>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label className="form-label">Day of Week</label>
                  <select className="form-select" value={editPracticeForm.day} onChange={e => setEditPracticeForm(f => ({ ...f, day: e.target.value }))}>
                    <option value="">— Select day —</option>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label className="form-label">End Date</label>
                  <input className="form-input" type="date" value={editPracticeForm.endDate} onChange={e => setEditPracticeForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </>
            ) : (
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={editPracticeForm.date} onChange={e => setEditPracticeForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            )}

            <TimeRow
              label="Start Time"
              hour={editPracticeForm.startHour}
              minute={editPracticeForm.startMinute}
              ampm={editPracticeForm.startAmPm}
              onHour={v => setEditPracticeForm(f => ({ ...f, startHour: v }))}
              onMinute={v => setEditPracticeForm(f => ({ ...f, startMinute: v }))}
              onAmPm={v => setEditPracticeForm(f => ({ ...f, startAmPm: v }))}
            />
            <TimeRow
              label="End Time"
              hour={editPracticeForm.endHour}
              minute={editPracticeForm.endMinute}
              ampm={editPracticeForm.endAmPm}
              onHour={v => setEditPracticeForm(f => ({ ...f, endHour: v }))}
              onMinute={v => setEditPracticeForm(f => ({ ...f, endMinute: v }))}
              onAmPm={v => setEditPracticeForm(f => ({ ...f, endAmPm: v }))}
            />

            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label className="form-label">Location</label>
              <input className="form-input" value={editPracticeForm.location} onChange={e => setEditPracticeForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Riverside Park Field 2" />
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Focus</label>
              <input className="form-input" value={editPracticeForm.focus} onChange={e => setEditPracticeForm(f => ({ ...f, focus: e.target.value }))} placeholder="e.g. Hitting Focus" />
            </div>

            <button className="btn-primary" onClick={updatePracticeSlot}>Save Changes</button>
            <button onClick={() => toggleCancelPractice(editPracticeModal.slotIndex, editPracticeModal.cancelled)} style={{
              width: '100%', marginTop: '8px', padding: '12px', borderRadius: '10px', cursor: 'pointer',
              fontWeight: '700', fontSize: '15px', border: 'none',
              background: editPracticeModal.cancelled ? '#DCFCE7' : '#FEE2E2',
              color: editPracticeModal.cancelled ? '#16A34A' : '#B91C1C'
            }}>{editPracticeModal.cancelled ? 'Restore Practice' : 'Cancel Practice'}</button>
          </div>
        </div>
      )}

      {practiceModal && (
        <PracticeScheduleModal
          current={practiceSchedule}
          onSave={savePractices}
          onClose={() => setPracticeModal(false)}
        />
      )}

      {/* Calendar Sync Modal */}
      {showCalSync && (
        <div className="modal-overlay" onClick={() => setShowCalSync(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setShowCalSync(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              📅 Sync Schedule
            </h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '16px' }}>
              Add all upcoming games &amp; practices to your calendar app.
            </p>

            {/* Live subscription — auto-updates */}
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#166534', marginBottom: '6px' }}>
                ✅ Live Feed — Auto-updates when schedule changes
              </div>
              <p style={{ fontSize: '12px', color: '#15803D', lineHeight: '1.5', margin: '0 0 10px' }}>
                Subscribe once and your calendar stays in sync automatically.
              </p>
              <a
                href={`webcal://${window.location.host}/api/schedule`}
                style={{
                  display: 'block', width: '100%', padding: '12px', borderRadius: '10px',
                  background: '#16A34A', color: 'white', textAlign: 'center',
                  fontWeight: '700', fontSize: '14px', textDecoration: 'none',
                  boxSizing: 'border-box', marginBottom: '8px'
                }}
              >
                🍎 Subscribe in Apple Calendar
              </a>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/api/schedule`;
                  navigator.clipboard?.writeText(url).then(() => setToast('Feed URL copied!')).catch(() => setToast(url));
                }}
                style={{
                  width: '100%', padding: '10px', borderRadius: '10px', cursor: 'pointer',
                  fontWeight: '600', fontSize: '13px', border: '1.5px solid #86EFAC',
                  background: 'white', color: '#166534'
                }}
              >
                📋 Copy Feed URL (for Google Calendar / Outlook)
              </button>
              <p style={{ fontSize: '11px', color: '#4ADE80', marginTop: '6px', textAlign: 'center' }}>
                Google Calendar: Settings → Add calendar → From URL → paste the link
              </p>
            </div>

            {/* Share / Copy as text */}
            <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '14px', marginBottom: '10px' }}>
              <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--gray-700)', marginBottom: '10px' }}>SHARE WITH PARENTS:</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <button onClick={shareSchedule} style={{
                padding: '14px', borderRadius: '12px', cursor: 'pointer',
                fontWeight: '700', fontSize: '15px', border: 'none',
                background: '#7C3AED', color: 'white'
              }}>
                📤 Share
              </button>
              <button onClick={copySchedule} style={{
                padding: '14px', borderRadius: '12px', cursor: 'pointer',
                fontWeight: '700', fontSize: '15px', border: '2px solid #7C3AED',
                background: 'white', color: '#7C3AED'
              }}>
                📋 Copy Text
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', textAlign: 'center', marginBottom: '18px' }}>
              Share or copy to paste in a text / email to parents
            </p>

            {/* One-time download */}
            <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: '14px', marginBottom: '10px' }}>
              <p style={{ fontWeight: '700', fontSize: '13px', color: 'var(--gray-700)', marginBottom: '10px' }}>ONE-TIME DOWNLOAD:</p>
            </div>
            <button onClick={downloadICS} style={{
              width: '100%', padding: '14px', borderRadius: '12px', cursor: 'pointer',
              fontWeight: '700', fontSize: '15px', border: 'none',
              background: 'var(--red)', color: 'white', marginBottom: '6px'
            }}>
              ⬇️ Download .ics File
            </button>
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', textAlign: 'center', marginBottom: '8px' }}>
              Snapshot only — won't update if schedule changes
            </p>

            <button className="btn-secondary" onClick={() => setShowCalSync(false)} style={{ marginTop: '8px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
