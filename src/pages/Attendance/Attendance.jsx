import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, setDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const DAY_MAP = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function getUpcomingPracticeDates(slot, weeksAhead = 12) {
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

export default function Attendance() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [sessions, setSessions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [newForm, setNewForm] = useState({ date: '', type: 'Practice', label: '' });
  const [toast, setToast] = useState('');
  const [viewTab, setViewTab] = useState('sessions');

  // Schedule data for the event picker
  const [games, setGames] = useState([]);
  const [practiceSchedule, setPracticeSchedule] = useState([]);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [allRsvps, setAllRsvps] = useState([]);

  useEffect(() => {
    const unsubs = [];
    const sessQ = query(collection(db, 'attendance'), orderBy('date', 'desc'));
    unsubs.push(onSnapshot(sessQ, snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'roster'), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().childName || '' }))
        .filter(p => p.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'games'), orderBy('date')), snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'practiceSchedule'), snap => {
      if (snap.exists() && snap.data().practices) setPracticeSchedule(snap.data().practices);
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'cancelledPractices'), snap => {
      setCancelledSlots(snap.exists() ? snap.data() : {});
    }));
    unsubs.push(onSnapshot(collection(db, 'rsvps'), snap => {
      setAllRsvps(snap.docs.map(d => d.data()));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  // Build schedule events (upcoming + recent 30 days)
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const practiceEvents = practiceSchedule.flatMap((slot, i) => {
    if (slot.type === 'onetime') {
      if (!slot.date) return [];
      return [{
        id: `practice-${i}-${slot.date}`,
        type: 'Practice',
        date: slot.date,
        slotIndex: i,
        label: slot.focus ? `Practice – ${slot.focus}` : 'Practice',
        time: slot.time,
        cancelled: !!cancelledSlots[i]
      }];
    }
    return getUpcomingPracticeDates(slot).map(date => ({
      id: `practice-${i}-${date}`,
      type: 'Practice',
      date,
      slotIndex: i,
      label: slot.focus ? `Practice – ${slot.focus}` : 'Practice',
      time: slot.time,
      cancelled: !!cancelledSlots[i]
    }));
  });

  const gameEvents = games.map(g => ({
    id: g.id,
    type: 'Game',
    date: g.date,
    label: `vs ${g.opponent}`,
    time: g.time,
    cancelled: !!g.cancelled
  }));

  const scheduleEvents = [...gameEvents, ...practiceEvents]
    .filter(e => !e.cancelled && e.date >= thirtyDaysAgo)
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcomingEvents = scheduleEvents.filter(e => e.date >= today);
  const recentEvents = scheduleEvents.filter(e => e.date < today);

  const sessionedIds = new Set(sessions.map(s => s.sourceId).filter(Boolean));

  const createSession = async () => {
    if (!newForm.date) return;
    const label = newForm.label.trim() || (newForm.type === 'Game' ? 'Game' : 'Practice');
    await addDoc(collection(db, 'attendance'), {
      date: newForm.date,
      type: newForm.type,
      label,
      records: {},
      createdAt: new Date().toISOString()
    });
    setNewForm({ date: '', type: 'Practice', label: '' });
    setShowNewModal(false);
    setShowManualForm(false);
    setToast('Session created!');
  };

  const createSessionFromEvent = async (event) => {
    // Build name→playerId map for RSVP pre-fill
    const nameToId = {};
    players.forEach(p => { nameToId[p.name.toLowerCase().trim()] = p.id; });

    // Pre-fill present from "yes" RSVPs
    const records = {};
    const eventField = event.type === 'Game' ? 'gameId' : 'practiceId';
    allRsvps
      .filter(r => r[eventField] === event.id && r.status === 'yes')
      .forEach(r => {
        const pid = nameToId[(r.playerName || '').toLowerCase().trim()];
        if (pid) records[pid] = 'present';
      });

    await addDoc(collection(db, 'attendance'), {
      date: event.date,
      type: event.type,
      label: event.label,
      records,
      sourceId: event.id,
      createdAt: new Date().toISOString()
    });
    setShowNewModal(false);
    const preCount = Object.keys(records).length;
    setToast(preCount > 0 ? `Session created – ${preCount} player${preCount !== 1 ? 's' : ''} pre-marked from RSVPs` : 'Session created!');
  };

  const toggleAttendance = async (session, playerId) => {
    if (!canEdit) return;
    const current = session.records?.[playerId];
    const next = current === 'present' ? 'absent' : 'present';
    const updatedRecords = { ...(session.records || {}), [playerId]: next };
    await setDoc(doc(db, 'attendance', session.id), { ...session, records: updatedRecords });
    setActiveSession(s => s ? { ...s, records: updatedRecords } : s);
  };

  const deleteSession = async (id) => {
    if (!window.confirm('Delete this session?')) return;
    await deleteDoc(doc(db, 'attendance', id));
    setActiveSession(null);
    setToast('Session deleted');
  };

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  const presentCount = (session) =>
    Object.values(session.records || {}).filter(v => v === 'present').length;
  const absentCount = (session) =>
    Object.values(session.records || {}).filter(v => v === 'absent').length;

  const playerSummary = players.map(player => {
    const total = sessions.length;
    const present = sessions.filter(s => s.records?.[player.id] === 'present').length;
    const absent = sessions.filter(s => s.records?.[player.id] === 'absent').length;
    const marked = present + absent;
    const pct = marked > 0 ? Math.round((present / marked) * 100) : null;
    return { ...player, present, absent, total, marked, pct };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  const EventPickerRow = ({ event }) => {
    const already = sessionedIds.has(event.id);
    const dateObj = new Date(event.date + 'T12:00:00');
    return (
      <button
        onClick={() => !already && createSessionFromEvent(event)}
        style={{
          width: '100%', background: already ? 'var(--gray-50)' : 'white',
          border: `1px solid ${already ? 'var(--gray-100)' : 'var(--gray-200)'}`,
          borderRadius: '10px', padding: '10px 12px', cursor: already ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', textAlign: 'left'
        }}
      >
        <div style={{
          background: event.type === 'Game' ? 'var(--red)' : '#1D4ED8',
          color: 'white', borderRadius: '8px', padding: '4px 8px', textAlign: 'center',
          minWidth: '44px', flexShrink: 0
        }}>
          <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' }}>
            {dateObj.toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
            {dateObj.getDate()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '700', fontSize: '14px', color: already ? 'var(--gray-400)' : 'var(--black)' }}>
            {event.type === 'Game' ? '⚾' : '🏋️'} {event.label}
          </div>
          {event.time && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>{event.time}</div>}
        </div>
        {already ? (
          <span style={{ fontSize: '18px' }}>✅</span>
        ) : (
          <span style={{ fontSize: '18px', color: 'var(--gray-300)' }}>+</span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Attendance" back="/" actions={canEdit && !activeSession && (
        <button onClick={() => { setShowNewModal(true); setShowManualForm(false); }} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', fontSize: '20px'
        }}>+</button>
      )} />

      {/* Detail view */}
      {activeSession ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            background: 'white', borderBottom: '1px solid var(--gray-200)',
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <button onClick={() => setActiveSession(null)} style={{
              background: 'var(--gray-100)', border: 'none', borderRadius: '8px',
              padding: '6px 12px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'
            }}>← Back</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '15px' }}>{activeSession.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                {formatDate(activeSession.date)} · {presentCount(activeSession)}/{players.length} present
              </div>
            </div>
            {canEdit && (
              <button onClick={() => deleteSession(activeSession.id)} style={{
                background: 'none', border: 'none', color: 'var(--gray-400)',
                cursor: 'pointer', fontSize: '20px'
              }}>🗑️</button>
            )}
          </div>

          <div style={{
            background: 'var(--gray-50)', padding: '10px 16px',
            display: 'flex', gap: '16px', borderBottom: '1px solid var(--gray-200)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{presentCount(activeSession)} present</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{absentCount(activeSession)} absent</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
              {players.length - presentCount(activeSession) - absentCount(activeSession)} unmarked
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map(player => {
              const status = activeSession.records?.[player.id];
              return (
                <div key={player.id} style={{
                  background: 'white', border: `1px solid ${status === 'present' ? '#86EFAC' : status === 'absent' ? '#FECACA' : 'var(--gray-200)'}`,
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: status === 'present' ? '#DCFCE7' : status === 'absent' ? '#FEE2E2' : 'var(--gray-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', flexShrink: 0
                  }}>
                    {status === 'present' ? '✅' : status === 'absent' ? '❌' : '⬜'}
                  </div>
                  <div style={{ flex: 1, fontWeight: '600', fontSize: '15px' }}>{player.name}</div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => toggleAttendance(activeSession, player.id)}
                        style={{
                          padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                          border: `1.5px solid ${status === 'present' ? '#16A34A' : 'var(--gray-200)'}`,
                          background: status === 'present' ? '#DCFCE7' : 'white',
                          color: status === 'present' ? '#16A34A' : 'var(--gray-500)',
                          fontWeight: '700', fontSize: '13px'
                        }}
                      >Here</button>
                      <button
                        onClick={async () => {
                          const updatedRecords = { ...(activeSession.records || {}), [player.id]: 'absent' };
                          await setDoc(doc(db, 'attendance', activeSession.id), { ...activeSession, records: updatedRecords });
                          setActiveSession(s => s ? { ...s, records: updatedRecords } : s);
                        }}
                        style={{
                          padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                          border: `1.5px solid ${status === 'absent' ? '#DC2626' : 'var(--gray-200)'}`,
                          background: status === 'absent' ? '#FEE2E2' : 'white',
                          color: status === 'absent' ? '#DC2626' : 'var(--gray-500)',
                          fontWeight: '700', fontSize: '13px'
                        }}
                      >Out</button>
                    </div>
                  )}
                  {!canEdit && status && (
                    <span style={{
                      fontSize: '13px', fontWeight: '600',
                      color: status === 'present' ? '#16A34A' : '#DC2626'
                    }}>{status === 'present' ? 'Present' : 'Absent'}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="page-content">
          <div style={{ display: 'flex', marginBottom: '14px', background: 'var(--gray-100)', borderRadius: '10px', padding: '3px' }}>
            {['sessions', 'summary'].map(tab => (
              <button key={tab} onClick={() => setViewTab(tab)} style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                background: viewTab === tab ? 'white' : 'transparent',
                fontWeight: '700', fontSize: '13px',
                color: viewTab === tab ? 'var(--red)' : 'var(--gray-500)',
                fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase',
                boxShadow: viewTab === tab ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s'
              }}>{tab === 'sessions' ? 'Sessions' : 'Player Summary'}</button>
            ))}
          </div>

          {viewTab === 'sessions' ? (
            sessions.length === 0 ? (
              <div className="empty-state">
                <p style={{ fontSize: '32px' }}>📋</p>
                <p>No sessions yet.{canEdit ? ' Tap + to add one.' : ''}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map(session => {
                  const p = presentCount(session);
                  const pct = players.length > 0 ? Math.round((p / players.length) * 100) : 0;
                  return (
                    <div
                      key={session.id}
                      onClick={() => setActiveSession(session)}
                      style={{
                        background: 'white', border: '1px solid var(--gray-200)',
                        borderRadius: '10px', padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: '10px',
                        background: session.type === 'Game' ? 'var(--red)' : '#1D4ED8',
                        color: 'white', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '20px', flexShrink: 0
                      }}>
                        {session.type === 'Game' ? '⚾' : '🏋️'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '15px' }}>{session.label}</div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                          {formatDate(session.date)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <div style={{ flex: 1, background: 'var(--gray-200)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#16A34A', borderRadius: '4px', transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--gray-500)', flexShrink: 0 }}>{p}/{players.length}</span>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            players.length === 0 ? (
              <div className="empty-state"><p>No players on roster yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {playerSummary.map(player => (
                  <div key={player.id} style={{
                    background: 'white', border: '1px solid var(--gray-200)',
                    borderRadius: '10px', padding: '12px 14px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, fontWeight: '700', fontSize: '15px' }}>{player.name}</div>
                      <div style={{ textAlign: 'right' }}>
                        {player.pct !== null ? (
                          <span style={{
                            fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '700',
                            color: player.pct >= 80 ? '#16A34A' : player.pct >= 60 ? '#D97706' : '#DC2626'
                          }}>{player.pct}%</span>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--gray-400)' }}>No data</span>
                        )}
                      </div>
                    </div>
                    <div style={{ background: 'var(--gray-200)', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '6px' }}>
                      <div style={{
                        width: player.marked > 0 ? `${player.pct}%` : '0%',
                        height: '100%', borderRadius: '4px', transition: 'width 0.3s',
                        background: player.pct >= 80 ? '#16A34A' : player.pct >= 60 ? '#D97706' : '#DC2626'
                      }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: '600' }}>✅ {player.present} present</span>
                      <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: '600' }}>❌ {player.absent} absent</span>
                      <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{player.total - player.marked} unmarked</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* New Session Modal — event picker */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => { setShowNewModal(false); setShowManualForm(false); }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              New Session
            </h3>

            {!showManualForm ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '14px' }}>
                  Pick a game or practice from the schedule
                </p>

                {upcomingEvents.length > 0 && (
                  <>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Upcoming</p>
                    {upcomingEvents.map(e => <EventPickerRow key={e.id} event={e} />)}
                  </>
                )}

                {recentEvents.length > 0 && (
                  <>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: upcomingEvents.length ? '12px' : 0 }}>Recent</p>
                    {recentEvents.map(e => <EventPickerRow key={e.id} event={e} />)}
                  </>
                )}

                {upcomingEvents.length === 0 && recentEvents.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-400)', fontSize: '14px' }}>
                    No games or practices found on the schedule
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--gray-100)', marginTop: '16px', paddingTop: '14px' }}>
                  <button onClick={() => setShowManualForm(true)} style={{
                    width: '100%', padding: '11px', borderRadius: '10px', cursor: 'pointer',
                    background: 'transparent', border: '1.5px dashed var(--gray-300)',
                    color: 'var(--gray-500)', fontWeight: '600', fontSize: '14px'
                  }}>
                    + Create manually
                  </button>
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setShowManualForm(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--gray-500)', fontSize: '13px', fontWeight: '600',
                  padding: '0 0 12px 0', display: 'block'
                }}>← Back to schedule</button>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Practice', 'Game'].map(t => (
                      <button key={t} type="button" onClick={() => setNewForm(f => ({ ...f, type: t }))} style={{
                        flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                        border: `2px solid ${newForm.type === t ? 'var(--red)' : 'var(--gray-200)'}`,
                        background: newForm.type === t ? '#FEF2F2' : 'white',
                        fontWeight: '700', fontSize: '14px',
                        color: newForm.type === t ? 'var(--red)' : 'var(--gray-500)'
                      }}>{t === 'Game' ? '⚾ Game' : '🏋️ Practice'}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={newForm.date} onChange={e => setNewForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Label (optional)</label>
                  <input
                    className="form-input"
                    value={newForm.label}
                    onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
                    placeholder={newForm.type === 'Game' ? 'e.g. vs Tigers' : 'e.g. Tuesday Practice'}
                  />
                </div>
                <button className="btn-primary" onClick={createSession} disabled={!newForm.date}>
                  Create Session
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
