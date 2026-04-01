import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import PracticeScheduleModal from './PracticeScheduleModal';

const DEFAULT_PRACTICES = [
  { day: 'Tuesday', time: '4:45 – 6:00 PM', focus: 'Fielding Focus' },
  { day: 'Thursday', time: '7:15 – 8:30 PM', focus: 'Hitting Focus' }
];

export default function Home() {
  const { isCoach, isAdmin, userProfile, chatDisplayName } = useAuth();
  const navigate = useNavigate();
  const [nextGame, setNextGame] = useState(null);
  const [record, setRecord] = useState({ wins: 0, losses: 0 });
  const [recentGames, setRecentGames] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notification, setNotification] = useState(null);
  const [dismissedNotif, setDismissedNotif] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [toast, setToast] = useState('');
  const [announcementText, setAnnouncementText] = useState('');
  const [notifText, setNotifText] = useState('');
  const [accessCodes, setAccessCodes] = useState({ coach: 'DRAGONS-COACH', bookkeeper: 'DRAGONS-BOOKS' });
  const [practices, setPractices] = useState(DEFAULT_PRACTICES);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [liveStream, setLiveStream] = useState(null);
  const [deleteGameConfirm, setDeleteGameConfirm] = useState(false);

  useEffect(() => {
    const unsubs = [];

    unsubs.push(onSnapshot(doc(db, 'settings', 'nextGame'), snap => {
      if (snap.exists()) setNextGame(snap.data());
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'notification'), snap => {
      if (snap.exists()) setNotification(snap.data());
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'accessCodes'), snap => {
      if (snap.exists()) setAccessCodes(snap.data());
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'practiceSchedule'), snap => {
      if (snap.exists() && snap.data().practices) setPractices(snap.data().practices);
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'cancelledPractices'), snap => {
      setCancelledSlots(snap.exists() ? snap.data() : {});
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'liveStream'), snap => {
      setLiveStream(snap.exists() ? snap.data() : null);
    }));

    const gamesQ = query(collection(db, 'games'), orderBy('date', 'desc'));
    unsubs.push(onSnapshot(gamesQ, snap => {
      const games = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const played = games.filter(g => g.result);
      const recent = played.slice(0, 3);
      setRecentGames(recent);
      const wins = played.filter(g => g.result === 'W').length;
      const losses = played.filter(g => g.result === 'L').length;
      setRecord({ wins, losses });
      const upcoming = games.filter(g => !g.result && g.date >= new Date().toISOString().split('T')[0]);
      if (upcoming.length) setNextGame(upcoming[upcoming.length - 1]);
    }));

    const annQ = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    unsubs.push(onSnapshot(annQ, snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  const deleteNextGame = async () => {
    if (nextGame?.id) {
      await deleteDoc(doc(db, 'games', nextGame.id));
    }
    await setDoc(doc(db, 'settings', 'nextGame'), {});
    setNextGame(null);
    setDeleteGameConfirm(false);
    setToast('Game removed');
  };

  const saveNextGame = async (data) => {
    await setDoc(doc(db, 'settings', 'nextGame'), data);
    setToast('Next game updated!');
    setEditModal(null);
  };

  const addAnnouncement = async () => {
    if (!announcementText.trim()) return;
    await addDoc(collection(db, 'announcements'), {
      text: announcementText,
      authorName: chatDisplayName,
      createdAt: new Date().toISOString()
    });
    setAnnouncementText('');
    setToast('Announcement posted!');
  };

  const deleteAnnouncement = async (id) => {
    await deleteDoc(doc(db, 'announcements', id));
  };

  const postNotification = async () => {
    if (!notifText.trim()) return;
    await setDoc(doc(db, 'settings', 'notification'), {
      text: notifText,
      createdAt: new Date().toISOString()
    });
    setNotifText('');
    setToast('Notification posted!');
    setEditModal(null);
  };

  const clearNotification = async () => {
    await setDoc(doc(db, 'settings', 'notification'), { text: '', createdAt: '' });
    setDismissedNotif(true);
  };

  const saveAccessCodes = async (codes) => {
    await setDoc(doc(db, 'settings', 'accessCodes'), codes);
    setAccessCodes(codes);
    setToast('Access codes updated!');
    setEditModal(null);
  };

  const savePractices = async (data) => {
    await setDoc(doc(db, 'settings', 'practiceSchedule'), { practices: data });
    setToast('Practice schedule updated!');
    setEditModal(null);
  };

  const winPct = record.wins + record.losses > 0
    ? ((record.wins / (record.wins + record.losses)) * 100).toFixed(0)
    : '--';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Dragons Baseball" actions={
        isCoach && (
          <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setEditModal('accessCodes')} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '8px', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer', fontSize: '16px'
          }}>🔑</button>
          <button onClick={() => setEditModal('notification')} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '8px', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          </div>
        )
      } />

      <div className="page-content" style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 16px)' }}>

        {/* Live Stream Banner */}
        {liveStream?.isLive && (
          <button onClick={() => navigate('/live-scoring')} style={{
            width: '100%', marginBottom: '14px', padding: '12px 16px',
            borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left',
            background: 'linear-gradient(135deg, #1a1a1a, #111)',
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: '#ff4444',
              flexShrink: 0, boxShadow: '0 0 6px #ff4444'
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '15px', color: '#ff4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Live Now
              </div>
              {liveStream.title && (
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>{liveStream.title}</div>
              )}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '20px' }}>›</span>
          </button>
        )}

        {/* Notification Banner */}
        {notification?.text && !dismissedNotif && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '10px', padding: '12px 14px',
            marginBottom: '14px', display: 'flex',
            alignItems: 'flex-start', gap: '10px', color: 'white'
          }}>
            <span style={{ fontSize: '18px' }}>📣</span>
            <p style={{ flex: 1, fontSize: '14px', lineHeight: '1.4' }}>{notification.text}</p>
            <button onClick={() => setDismissedNotif(true)} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: '50%', width: 24, height: 24,
              color: 'white', cursor: 'pointer', fontSize: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>×</button>
          </div>
        )}

        {/* Announcements */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">📢 Announcements</span>
          </div>
          {isCoach && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                className="form-input"
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                placeholder="Post an announcement..."
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && addAnnouncement()}
              />
              <button onClick={addAnnouncement} style={{
                background: 'var(--red)', color: 'white', border: 'none',
                borderRadius: '8px', padding: '0 14px', cursor: 'pointer',
                fontWeight: '600', fontSize: '14px', flexShrink: 0
              }}>Post</button>
            </div>
          )}
          {announcements.length === 0 ? (
            <div className="empty-state">
              <p>No announcements yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{
                  background: '#FFF5F5', border: '1px solid #FECACA',
                  borderRadius: '10px', padding: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={{ fontSize: '14px', color: 'var(--black)', lineHeight: '1.5', flex: 1 }}>{ann.text}</p>
                    {isCoach && (
                      <button onClick={() => deleteAnnouncement(ann.id)} style={{
                        background: 'none', border: 'none', color: 'var(--gray-400)',
                        cursor: 'pointer', fontSize: '18px', padding: '0 0 0 8px'
                      }}>×</button>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>
                    {ann.authorName} · {new Date(ann.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Game */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">⚾ Next Game</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {isCoach && (
                <button className="btn-ghost" onClick={() => setEditModal('nextGame')}>Edit</button>
              )}
              {isAdmin && nextGame && (
                <button className="btn-ghost" onClick={() => setDeleteGameConfirm(true)}
                  style={{ color: '#ef4444' }}>Delete</button>
              )}
            </div>
          </div>
          {nextGame ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'var(--red)', color: 'white', borderRadius: '10px',
                  padding: '8px 14px', textAlign: 'center', minWidth: '56px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' }}>
                    {new Date(nextGame.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
                    {new Date(nextGame.date + 'T12:00:00').getDate()}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '17px', color: 'var(--black)' }}>
                    vs {nextGame.opponent}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
                    {nextGame.time} · {nextGame.location}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: '700',
                      color: nextGame.homeAway === 'Home' ? 'var(--green)' : 'var(--blue)',
                      background: nextGame.homeAway === 'Home' ? '#DCFCE7' : '#DBEAFE',
                      padding: '2px 8px', borderRadius: '10px'
                    }}>{nextGame.homeAway || 'Home'}</span>
                  </div>
                </div>
                <button onClick={() => navigate('/schedule')} className="btn-ghost" style={{ fontSize: '12px' }}>
                  RSVP →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--gray-400)' }}>
              <p style={{ fontSize: '14px' }}>No upcoming games scheduled</p>
              {isCoach && (
                <button className="btn-ghost" onClick={() => navigate('/schedule')} style={{ marginTop: '8px' }}>
                  Add to Schedule →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recent Results */}
        {recentGames.length > 0 && (
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="section-header">
              <span className="section-title">Recent Results</span>
              <button className="btn-ghost" onClick={() => navigate('/schedule')} style={{ fontSize: '12px' }}>All →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentGames.map(game => (
                <div key={game.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '8px 0', borderBottom: '1px solid var(--gray-100)'
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: game.result === 'W' ? '#DCFCE7' : '#FEE2E2',
                    color: game.result === 'W' ? '#16A34A' : '#B91C1C',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '700', fontSize: '13px', flexShrink: 0,
                    fontFamily: 'Oswald, sans-serif'
                  }}>{game.result}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>vs {game.opponent}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                      {new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  {game.score && (
                    <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px', color: 'var(--gray-700)' }}>
                      {game.score}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Practice Schedule */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">🕐 Practice Schedule</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {isCoach && <button className="btn-ghost" onClick={() => setEditModal('practices')}>Edit</button>}
              <button className="btn-ghost" onClick={() => navigate('/practice')} style={{ fontSize: '12px' }}>Plans →</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {practices.map((p, i) => {
              const cancelled = !!cancelledSlots[i];
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: cancelled ? '#FEF2F2' : 'var(--gray-50)',
                  border: cancelled ? '1px solid #FECACA' : '1px solid transparent',
                  borderRadius: '10px', padding: '12px'
                }}>
                  <span style={{ fontSize: '24px' }}>{cancelled ? '🚫' : '⚾'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px', color: cancelled ? '#B91C1C' : 'var(--black)' }}>
                        {p.type === 'onetime'
                          ? (p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'One-time')
                          : p.day}
                      </div>
                      {p.type === 'onetime' && !cancelled && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#1D4ED8', background: '#DBEAFE', padding: '2px 7px', borderRadius: '8px' }}>📅 One-time</span>
                      )}
                      {(p.type || 'recurring') === 'recurring' && !cancelled && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#7C3AED', background: '#EDE9FE', padding: '2px 7px', borderRadius: '8px' }}>🔁</span>
                      )}
                      {cancelled && (
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#B91C1C', background: '#FEE2E2', padding: '2px 7px', borderRadius: '8px', textTransform: 'uppercase' }}>Cancelled</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--gray-500)', textDecoration: cancelled ? 'line-through' : 'none' }}>{p.time}</div>
                    {p.location && !cancelled && <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '1px' }}>📍 {p.location}</div>}
                    {p.focus && !cancelled && <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', marginTop: '2px' }}>{p.focus}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <span className="section-title" style={{ display: 'block', marginBottom: '12px' }}>Quick Actions</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { label: '📋 Practice', path: '/practice' },
              { label: '📊 Stats', path: '/stats' },
              { label: '📅 Schedule', path: '/schedule' },
              { label: '📋 Roster', path: '/roster' },
              { label: '🏟️ Live Score', path: '/live-scoring' },
              { label: '🥤 Team Drinks Sign Up', path: '/snacks' },
              { label: '⭐ Awards', path: '/awards' },
              { label: '📋 Attendance', path: '/attendance' }
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)} style={{
                background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                borderRadius: '10px', padding: '14px 10px',
                fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)',
                cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center'
              }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Season Record */}
        <div style={{
          background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
          borderRadius: '14px', padding: '20px', marginBottom: '14px',
          color: 'white'
        }}>
          <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '10px' }}>
            2026 Season Record
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '48px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>{record.wins}</div>
              <div style={{ fontSize: '12px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px' }}>Wins</div>
            </div>
            <div style={{ width: '1px', height: '60px', background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '48px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>{record.losses}</div>
              <div style={{ fontSize: '12px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px' }}>Losses</div>
            </div>
            <div style={{ width: '1px', height: '60px', background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '48px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>{winPct}</div>
              <div style={{ fontSize: '12px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px' }}>Win %</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Next Game Modal */}
      {editModal === 'nextGame' && (
        <NextGameModal onSave={saveNextGame} onClose={() => setEditModal(null)} current={nextGame} />
      )}

      {/* Notification Modal */}
      {editModal === 'notification' && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Post Notification Banner
            </h3>
            <div className="form-group">
              <label className="form-label">Banner Message</label>
              <textarea
                className="form-input"
                value={notifText}
                onChange={e => setNotifText(e.target.value)}
                placeholder="Important team message..."
                rows={3}
                style={{ resize: 'none' }}
              />
            </div>
            <button className="btn-primary" onClick={postNotification}>Post Banner</button>
            {notification?.text && (
              <button className="btn-secondary" onClick={clearNotification} style={{ marginTop: '8px' }}>
                Clear Current Banner
              </button>
            )}
          </div>
        </div>
      )}

      {/* Access Codes Modal */}
      {editModal === 'accessCodes' && (
        <AccessCodesModal
          current={accessCodes}
          onSave={saveAccessCodes}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Practice Schedule Modal */}
      {editModal === 'practices' && (
        <PracticeScheduleModal
          current={practices}
          onSave={savePractices}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Delete Next Game confirm modal */}
      {deleteGameConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteGameConfirm(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Remove Game?
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '20px' }}>
              vs {nextGame?.opponent} · {nextGame?.date ? new Date(nextGame.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '20px' }}>
              This will permanently delete this game from the schedule.
            </p>
            <button
              onClick={deleteNextGame}
              style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
                background: '#ef4444', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer'
              }}
            >
              Yes, Delete Game
            </button>
            <button className="btn-secondary" onClick={() => setDeleteGameConfirm(false)} style={{ marginTop: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}

function AccessCodesModal({ current, onSave, onClose }) {
  const [codes, setCodes] = useState({
    coach: current?.coach || 'DRAGONS-COACH',
    bookkeeper: current?.bookkeeper || 'DRAGONS-BOOKS'
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '6px', textTransform: 'uppercase' }}>
          🔑 Access Codes
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
          Share these private codes only with people you want to register as Coach or Bookkeeper.
        </p>
        <div className="form-group">
          <label className="form-label">Coach Code</label>
          <input
            className="form-input"
            value={codes.coach}
            onChange={e => setCodes(c => ({ ...c, coach: e.target.value.toUpperCase() }))}
            style={{ letterSpacing: '2px', fontWeight: '700', textTransform: 'uppercase' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Bookkeeper Code</label>
          <input
            className="form-input"
            value={codes.bookkeeper}
            onChange={e => setCodes(c => ({ ...c, bookkeeper: e.target.value.toUpperCase() }))}
            style={{ letterSpacing: '2px', fontWeight: '700', textTransform: 'uppercase' }}
          />
        </div>
        <div className="card" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: '#92400E' }}>
            ⚠️ Keep these codes private. Anyone with the code can register with that role.
          </p>
        </div>
        <button className="btn-primary" onClick={() => onSave(codes)}>Save Codes</button>
      </div>
    </div>
  );
}

function NextGameModal({ onSave, onClose, current }) {
  const [form, setForm] = useState({
    opponent: current?.opponent || '',
    date: current?.date || '',
    time: current?.time || '',
    location: current?.location || '',
    homeAway: current?.homeAway || 'Home'
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
          Next Game
        </h3>
        <div className="form-group">
          <label className="form-label">Opponent</label>
          <input className="form-input" value={form.opponent} onChange={e => set('opponent', e.target.value)} placeholder="Team name" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Time</label>
            <input className="form-input" value={form.time} onChange={e => set('time', e.target.value)} placeholder="5:30 PM" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">Location</label>
          <input className="form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Field name / address" />
        </div>
        <div className="form-group">
          <label className="form-label">Home / Away</label>
          <select className="form-select" value={form.homeAway} onChange={e => set('homeAway', e.target.value)}>
            <option value="Home">Home</option>
            <option value="Away">Away</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  );
}
