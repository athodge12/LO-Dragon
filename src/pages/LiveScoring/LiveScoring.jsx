import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import LogGameModal from '../../components/LogGameModal';

const INNINGS = [1, 2, 3, 4, 5, 6, 7];

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export default function LiveScoring() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [scoreData, setScoreData] = useState({
    opponent: '',
    dragons: [0, 0, 0, 0, 0, 0, 0],
    them: [0, 0, 0, 0, 0, 0, 0]
  });
  const [opponent, setOpponent] = useState('');
  const [liveStream, setLiveStream] = useState(null);
  const [streamModal, setStreamModal] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [toast, setToast] = useState('');
  const [showLogStats, setShowLogStats] = useState(false);
  const [players, setPlayers] = useState([]);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'settings', 'liveScore'), snap => {
        if (snap.exists()) {
          const data = snap.data();
          setScoreData(data);
          setOpponent(data.opponent || '');
        }
      }),
      onSnapshot(doc(db, 'settings', 'liveStream'), snap => {
        setLiveStream(snap.exists() ? snap.data() : null);
      }),
      onSnapshot(query(collection(db, 'roster'), orderBy('createdAt')), snap => {
        setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(doc(db, 'settings', 'season'), snap => {
        setSeason(snap.exists() ? snap.data() : { year: '2026' });
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const updateScore = async (team, inning, delta) => {
    if (!canEdit) return;
    const newData = { ...scoreData };
    const current = newData[team][inning - 1] || 0;
    newData[team][inning - 1] = Math.max(0, current + delta);
    await setDoc(doc(db, 'settings', 'liveScore'), newData);
  };

  const resetScore = async () => {
    if (!window.confirm('Reset the scoreboard?')) return;
    await setDoc(doc(db, 'settings', 'liveScore'), {
      opponent: scoreData.opponent,
      dragons: [0, 0, 0, 0, 0, 0, 0],
      them: [0, 0, 0, 0, 0, 0, 0]
    });
    setToast('Scoreboard reset!');
  };

  const saveOpponent = async () => {
    await setDoc(doc(db, 'settings', 'liveScore'), { ...scoreData, opponent }, { merge: true });
    setToast('Opponent set!');
  };

  const openStreamModal = () => {
    setStreamUrl(liveStream?.url || '');
    setStreamTitle(liveStream?.title || '');
    setStreamModal(true);
  };

  const saveStream = async () => {
    await setDoc(doc(db, 'settings', 'liveStream'), {
      url: streamUrl.trim(),
      title: streamTitle.trim(),
      isLive: liveStream?.isLive || false
    });
    setStreamModal(false);
    setToast('Stream saved!');
  };

  const toggleLive = async () => {
    const next = !liveStream?.isLive;
    await setDoc(doc(db, 'settings', 'liveStream'), {
      url: liveStream?.url || '',
      title: liveStream?.title || '',
      isLive: next
    });
    setToast(next ? '🔴 Stream is now LIVE' : 'Stream set to offline');
  };

  const clearStream = async () => {
    await setDoc(doc(db, 'settings', 'liveStream'), { url: '', title: '', isLive: false });
    setStreamModal(false);
    setToast('Stream cleared');
  };

  const total = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);
  const dragonsTotal = total(scoreData.dragons);
  const themTotal = total(scoreData.them);
  const videoId = getYouTubeId(liveStream?.url || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Live Scoring" back="/" actions={canEdit && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowLogStats(true)} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
            padding: '6px 10px', color: 'white', cursor: 'pointer',
            fontWeight: '700', fontSize: '12px'
          }}>📊 Stats</button>
          <button onClick={openStreamModal} style={{
            background: liveStream?.isLive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)',
            border: 'none', borderRadius: '8px',
            padding: '6px 10px', color: 'white', cursor: 'pointer',
            fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            {liveStream?.isLive
              ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', display: 'inline-block' }} /> LIVE</>
              : '📡 Stream'}
          </button>
        </div>
      )} />

      <div className="page-content">

        {/* Live stream embed */}
        {videoId && (
          <div style={{ marginBottom: '14px' }}>
            {liveStream?.isLive && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginBottom: '8px'
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#ff4444',
                  display: 'inline-block', animation: 'pulse 1.5s infinite'
                }} />
                <span style={{ fontWeight: '700', fontSize: '13px', color: '#ff4444', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Live
                </span>
                {liveStream?.title && (
                  <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>· {liveStream.title}</span>
                )}
              </div>
            )}
            <div style={{ borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Live Stream"
              />
            </div>
          </div>
        )}

        {!canEdit && <div className="view-only-banner">Live score updated by coaches</div>}

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <input
              className="form-input"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="Opponent name..."
              style={{ flex: 1 }}
            />
            <button onClick={saveOpponent} style={{
              background: 'var(--red)', color: 'white', border: 'none',
              borderRadius: '8px', padding: '0 14px', cursor: 'pointer', fontWeight: '600', flexShrink: 0
            }}>Set</button>
          </div>
        )}

        {/* Big scoreboard */}
        <div style={{
          background: '#111', borderRadius: '16px', padding: '20px',
          marginBottom: '14px', fontFamily: 'Oswald, sans-serif'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--red)', fontSize: '18px', fontWeight: '700', textTransform: 'uppercase' }}>
                Dragons
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                fontSize: '56px', fontWeight: '700',
                color: dragonsTotal >= themTotal ? '#FFD700' : 'white',
                lineHeight: 1, minWidth: '50px', textAlign: 'center'
              }}>{dragonsTotal}</div>
              <div style={{ color: 'var(--gray-400)', fontSize: '24px' }}>–</div>
              <div style={{
                fontSize: '56px', fontWeight: '700',
                color: themTotal > dragonsTotal ? '#FFD700' : 'white',
                lineHeight: 1, minWidth: '50px', textAlign: 'center'
              }}>{themTotal}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ color: 'var(--gray-400)', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase' }}>
                {scoreData.opponent || 'Opponent'}
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '320px' }}>
              <thead>
                <tr>
                  <td style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 8px', textAlign: 'left' }}>Team</td>
                  {INNINGS.map(i => (
                    <td key={i} style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 6px', textAlign: 'center' }}>{i}</td>
                  ))}
                  <td style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 8px', textAlign: 'center', fontWeight: '700' }}>R</td>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'DRG', key: 'dragons', color: 'var(--red)' },
                  { label: scoreData.opponent?.substring(0, 4)?.toUpperCase() || 'OPP', key: 'them', color: 'var(--gray-400)' }
                ].map(team => (
                  <tr key={team.key}>
                    <td style={{ color: team.color, fontSize: '14px', fontWeight: '700', padding: '6px 8px' }}>{team.label}</td>
                    {INNINGS.map(i => (
                      <td key={i} style={{ textAlign: 'center', padding: '6px 2px' }}>
                        {canEdit ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <button onClick={() => updateScore(team.key, i, 1)} style={{
                              background: 'var(--gray-700)', border: 'none', borderRadius: '3px',
                              color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1
                            }}>+</button>
                            <span style={{ color: 'white', fontSize: '16px', fontWeight: '700', lineHeight: 1 }}>
                              {scoreData[team.key]?.[i - 1] || 0}
                            </span>
                            <button onClick={() => updateScore(team.key, i, -1)} style={{
                              background: 'var(--gray-700)', border: 'none', borderRadius: '3px',
                              color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1
                            }}>–</button>
                          </div>
                        ) : (
                          <span style={{ color: 'white', fontSize: '16px', fontWeight: '700' }}>
                            {scoreData[team.key]?.[i - 1] || 0}
                          </span>
                        )}
                      </td>
                    ))}
                    <td style={{
                      textAlign: 'center', padding: '6px 8px',
                      color: 'white', fontSize: '18px', fontWeight: '700',
                      borderLeft: '1px solid var(--gray-700)'
                    }}>
                      {total(scoreData[team.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Game status */}
        <div className="card" style={{ textAlign: 'center', marginBottom: '14px' }}>
          {dragonsTotal > themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--green)', fontWeight: '700' }}>
              🏆 Dragons Lead {dragonsTotal}–{themTotal}
            </p>
          ) : dragonsTotal < themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--red)', fontWeight: '700' }}>
              Trailing {dragonsTotal}–{themTotal}
            </p>
          ) : (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--gray-500)', fontWeight: '700' }}>
              🤝 Tied {dragonsTotal}–{themTotal}
            </p>
          )}
        </div>

        {canEdit && (
          <button className="btn-secondary" onClick={resetScore} style={{ width: '100%' }}>
            🔄 Reset Scoreboard
          </button>
        )}
      </div>

      {/* Stream setup modal */}
      {streamModal && (
        <div className="modal-overlay" onClick={() => setStreamModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Live Stream Setup
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
              Start a free YouTube Live stream from the YouTube Studio app, then paste the URL below.
            </p>

            <div className="form-group">
              <label className="form-label">YouTube URL</label>
              <input
                className="form-input"
                value={streamUrl}
                onChange={e => setStreamUrl(e.target.value)}
                placeholder="https://youtube.com/live/..."
              />
              {streamUrl && !getYouTubeId(streamUrl) && (
                <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px' }}>
                  Couldn't find a YouTube video ID in that URL.
                </p>
              )}
              {streamUrl && getYouTubeId(streamUrl) && (
                <p style={{ fontSize: '12px', color: '#16A34A', marginTop: '4px' }}>
                  ✓ Valid YouTube URL
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Label (optional)</label>
              <input
                className="form-input"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                placeholder="e.g. vs. Blue Jays — Apr 7"
              />
            </div>

            <button className="btn-primary" onClick={saveStream} style={{ marginBottom: '8px' }}>
              Save Stream
            </button>

            {liveStream?.url && (
              <button onClick={toggleLive} style={{
                width: '100%', marginBottom: '8px', padding: '12px', borderRadius: '10px',
                cursor: 'pointer', fontWeight: '700', fontSize: '15px', border: 'none',
                background: liveStream?.isLive ? '#DCFCE7' : '#FEE2E2',
                color: liveStream?.isLive ? '#16A34A' : '#B91C1C'
              }}>
                {liveStream?.isLive ? '⏹ Go Offline' : '🔴 Go Live'}
              </button>
            )}

            {liveStream?.url && (
              <button className="btn-secondary" onClick={clearStream} style={{ color: 'var(--red)' }}>
                Clear Stream
              </button>
            )}
          </div>
        </div>
      )}

      {showLogStats && (
        <LogGameModal
          players={players}
          currentYear={season?.year || '2026'}
          games={[]}
          initialGame={{
            id: 'live_' + new Date().toISOString().slice(0, 10),
            opponent: scoreData.opponent || 'Opponent',
            date: new Date().toISOString().slice(0, 10),
            year: season?.year || '2026'
          }}
          onClose={() => setShowLogStats(false)}
          onSaved={msg => { setToast(msg); setShowLogStats(false); }}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
