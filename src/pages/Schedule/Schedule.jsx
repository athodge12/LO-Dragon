import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const DAY_MAP = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function getUpcomingPracticeDates(slot, weeksAhead = 10) {
  const targetDay = DAY_MAP[slot.day];
  if (targetDay === undefined) return [];
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = new Date(today);
  const daysUntil = (targetDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + (daysUntil === 0 ? 0 : daysUntil));
  for (let i = 0; i < weeksAhead; i++) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

export default function Schedule() {
  const { isCoach, isBookkeeper, currentUser, userProfile } = useAuth();
  const canScore = isCoach || isBookkeeper;
  const [tab, setTab] = useState('all');
  const [games, setGames] = useState([]);
  const [practiceSchedule, setPracticeSchedule] = useState([]);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [modal, setModal] = useState(null);
  const [scoreModal, setScoreModal] = useState(null);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ opponent: '', date: '', time: '', location: '', homeAway: 'Home' });
  const [score, setScore] = useState({ us: '', them: '', result: 'W' });
  const [rsvps, setRsvps] = useState({});

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
          if (data.userId === currentUser.uid) userRsvps[data.gameId] = data.status;
        });
        setRsvps(userRsvps);
      }));
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser]);

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
      cancelled: !!cancelledSlots[i]
    }));
  });

  const today = new Date().toISOString().split('T')[0];

  const gameEvents = games.map(g => ({ ...g, type: 'game' }));

  const allEvents = [...gameEvents, ...practiceEvents]
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const completedGames = games.filter(g => g.result);

  const visibleUpcoming = tab === 'all' ? allEvents
    : tab === 'games' ? allEvents.filter(e => e.type === 'game')
    : allEvents.filter(e => e.type === 'practice');

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
    setToast('Game deleted');
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

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  const DateBadge = ({ date, result }) => {
    const dateObj = new Date(date + 'T12:00:00');
    return (
      <div style={{
        background: result ? (result === 'W' ? '#DCFCE7' : '#FEE2E2') : 'var(--red)',
        color: result ? (result === 'W' ? '#16A34A' : '#B91C1C') : 'white',
        borderRadius: '10px', padding: '6px 10px', textAlign: 'center', minWidth: '52px', flexShrink: 0
      }}>
        <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>
          {dateObj.toLocaleDateString('en-US', { month: 'short' })}
        </div>
        <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
          {dateObj.getDate()}
        </div>
        {result && <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'Oswald, sans-serif' }}>{result}</div>}
      </div>
    );
  };

  const GameCard = ({ game }) => {
    const myRsvp = rsvps[game.id];
    return (
      <div className="card" style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <DateBadge date={game.date} result={game.result} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '700', fontSize: '16px' }}>vs {game.opponent}</span>
              <span style={{
                fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px',
                background: game.homeAway === 'Home' ? '#DCFCE7' : '#DBEAFE',
                color: game.homeAway === 'Home' ? '#16A34A' : '#2563EB'
              }}>{game.homeAway || 'Home'}</span>
              {game.score && (
                <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '15px', color: 'var(--gray-700)' }}>
                  {game.score}
                </span>
              )}
            </div>
            {game.time && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>{game.time}</div>}
            {game.location && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>📍 {game.location}</div>}
            {!game.result && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
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
          </div>
          {canScore && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
              {!game.result && (
                <button onClick={() => { setScoreModal(game); setScore({ us: '', them: '', result: 'W' }); }} style={{
                  background: 'var(--gray-100)', border: 'none', borderRadius: '6px',
                  padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', color: 'var(--gray-600)'
                }}>Score</button>
              )}
              {isCoach && <button onClick={() => deleteGame(game.id)} style={{
                background: '#FEE2E2', border: 'none', borderRadius: '6px',
                padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', color: 'var(--red)'
              }}>Del</button>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const PracticeCard = ({ event }) => (
    <div className="card" style={{
      marginBottom: '10px',
      opacity: event.cancelled ? 0.6 : 1,
      border: event.cancelled ? '1px solid #FECACA' : undefined,
      background: event.cancelled ? '#FFF5F5' : undefined
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: '15px' }}>Practice</span>
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
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Schedule" actions={isCoach && (
        <button onClick={() => setModal(true)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )} />

      <div className="page-content">
        <div className="tabs" style={{ marginBottom: '14px' }}>
          <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
          <button className={`tab ${tab === 'games' ? 'active' : ''}`} onClick={() => setTab('games')}>Games</button>
          <button className={`tab ${tab === 'practices' ? 'active' : ''}`} onClick={() => setTab('practices')}>Practices</button>
        </div>

        {!isCoach && tab !== 'practices' && (
          <div className="view-only-banner">Tap Yes / No / Maybe to RSVP to each game</div>
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
              <span className="section-title">Results ({completedGames.length})</span>
            </div>
            {completedGames.map(g => <GameCard key={g.id} game={{ ...g, type: 'game' }} />)}
          </>
        )}
      </div>

      {/* Add Game Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
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

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
