import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, setDoc, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Attendance() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [sessions, setSessions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ date: '', type: 'Practice', label: '' });
  const [toast, setToast] = useState('');
  const [viewTab, setViewTab] = useState('sessions'); // 'sessions' | 'summary'

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
    return () => unsubs.forEach(u => u());
  }, []);

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
    setToast('Session created!');
  };

  const toggleAttendance = async (session, playerId) => {
    if (!canEdit) return;
    const current = session.records?.[playerId];
    const next = current === 'present' ? 'absent' : 'present';
    const updatedRecords = { ...(session.records || {}), [playerId]: next };
    await setDoc(doc(db, 'attendance', session.id), { ...session, records: updatedRecords });
    // Update local activeSession immediately for snappy UI
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

  // Per-player attendance summary
  const playerSummary = players.map(player => {
    const total = sessions.length;
    const present = sessions.filter(s => s.records?.[player.id] === 'present').length;
    const absent = sessions.filter(s => s.records?.[player.id] === 'absent').length;
    const marked = present + absent;
    const pct = marked > 0 ? Math.round((present / marked) * 100) : null;
    return { ...player, present, absent, total, marked, pct };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Attendance" back="/" actions={canEdit && !activeSession && (
        <button onClick={() => setShowNewModal(true)} style={{
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

          {/* Attendance stats bar */}
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
        /* List view */
        <div className="page-content">
          {/* Tabs */}
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
                        {/* Mini progress bar */}
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
            /* Player summary */
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

      {/* New Session Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              New Session
            </h3>
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
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
