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
    opponent: '', gameId: null, gameDate: null,
    dragons: [0, 0, 0, 0, 0, 0, 0],
    them: [0, 0, 0, 0, 0, 0, 0]
  });
  const [liveStream, setLiveStream] = useState(null);
  const [streamModal, setStreamModal] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [toast, setToast] = useState('');

  const [showLogStats, setShowLogStats] = useState(false);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [showEndGame, setShowEndGame] = useState(false);
  const [scoringInning, setScoringInning] = useState(1);

  const DEFAULT_CHECKLIST = [
    { label: 'Lineup set', done: false },
    { label: 'Batting order locked', done: false },
    { label: 'Equipment bag packed', done: false },
    { label: 'Umpire notified', done: false },
    { label: 'Snacks confirmed', done: false },
  ];
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [newCheckItem, setNewCheckItem] = useState('');

  const [players, setPlayers] = useState([]);
  const [season, setSeason] = useState(null);
  const [games, setGames] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const unsubs = [
      onSnapshot(doc(db, 'settings', 'liveScore'), snap => {
        if (snap.exists()) setScoreData(snap.data());
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
      // upcoming + recent games for the picker
      onSnapshot(query(collection(db, 'games'), orderBy('date', 'desc')), snap => {
        setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(doc(db, 'settings', 'gameChecklist'), snap => {
        if (snap.exists() && snap.data().items) setChecklist(snap.data().items);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const updateScore = async (team, inning, delta) => {
    if (!canEdit) return;
    const updated = { ...scoreData };
    updated[team] = [...(updated[team] || [0,0,0,0,0,0,0])];
    updated[team][inning - 1] = Math.max(0, (updated[team][inning - 1] || 0) + delta);
    await setDoc(doc(db, 'settings', 'liveScore'), updated);
  };

  const updateOuts = async () => {
    if (!canEdit) return;
    const newOuts = ((scoreData.outs || 0) + 1) % 4;
    await setDoc(doc(db, 'settings', 'liveScore'), { ...scoreData, outs: newOuts });
  };

  // Load a game from the schedule onto the scoreboard
  const loadGame = async (game) => {
    const newScore = {
      opponent: game.opponent,
      gameId: game.id,
      gameDate: game.date,
      dragons: [0, 0, 0, 0, 0, 0, 0],
      them: [0, 0, 0, 0, 0, 0, 0]
    };
    await setDoc(doc(db, 'settings', 'liveScore'), newScore);
    // Reset checklist for new game
    await setDoc(doc(db, 'settings', 'gameChecklist'), { items: DEFAULT_CHECKLIST });
    setShowGamePicker(false);
    setToast(`Loaded: vs ${game.opponent}`);
  };

  const toggleCheckItem = async (idx) => {
    const updated = checklist.map((item, i) => i === idx ? { ...item, done: !item.done } : item);
    setChecklist(updated);
    await setDoc(doc(db, 'settings', 'gameChecklist'), { items: updated });
  };

  const addCheckItem = async () => {
    const label = newCheckItem.trim();
    if (!label) return;
    const updated = [...checklist, { label, done: false }];
    setChecklist(updated);
    setNewCheckItem('');
    await setDoc(doc(db, 'settings', 'gameChecklist'), { items: updated });
  };

  const removeCheckItem = async (idx) => {
    const updated = checklist.filter((_, i) => i !== idx);
    setChecklist(updated);
    await setDoc(doc(db, 'settings', 'gameChecklist'), { items: updated });
  };

  // Record final W/L result back to the game document
  const recordResult = async (result) => {
    if (!scoreData.gameId) return;
    await setDoc(doc(db, 'games', scoreData.gameId), {
      result,
      score: { us: dragonsTotal, them: themTotal }
    }, { merge: true });
    setShowEndGame(false);
    setToast(`Result recorded — ${result === 'W' ? 'Win!' : 'Loss'} ${dragonsTotal}–${themTotal}`);
  };

  const resetScore = async () => {
    if (!window.confirm('Reset the scoreboard? This will clear all inning scores.')) return;
    await setDoc(doc(db, 'settings', 'liveScore'), {
      ...scoreData,
      dragons: [0, 0, 0, 0, 0, 0, 0],
      them: [0, 0, 0, 0, 0, 0, 0]
    });
    setToast('Scoreboard reset!');
  };

  const openStreamModal = () => {
    setStreamUrl(liveStream?.url || '');
    setStreamTitle(liveStream?.title || '');
    setStreamModal(true);
  };

  const saveStream = async () => {
    await setDoc(doc(db, 'settings', 'liveStream'), {
      url: streamUrl.trim(), title: streamTitle.trim(), isLive: liveStream?.isLive || false
    });
    setStreamModal(false);
    setToast('Stream saved!');
  };

  const toggleLive = async () => {
    const next = !liveStream?.isLive;
    await setDoc(doc(db, 'settings', 'liveStream'), { url: liveStream?.url || '', title: liveStream?.title || '', isLive: next });
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
  const currentYear = season?.year || '2026';

  // The game object to pass to LogGameModal — use real game ID if we have one
  const activeGame = scoreData.gameId
    ? { id: scoreData.gameId, opponent: scoreData.opponent, date: scoreData.gameDate || new Date().toISOString().slice(0, 10), year: currentYear }
    : { id: 'live_' + new Date().toISOString().slice(0, 10), opponent: scoreData.opponent || 'Opponent', date: new Date().toISOString().slice(0, 10), year: currentYear };

  const today = new Date().toISOString().slice(0, 10);
  const upcomingGames = games.filter(g => !g.result && g.date >= today);
  const recentGames = games.filter(g => g.result || g.date < today);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Games" back="/" actions={canEdit && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowLogStats(true)} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
            padding: '6px 10px', color: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '12px'
          }}>📊 Stats</button>
          <button onClick={openStreamModal} style={{
            background: liveStream?.isLive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)',
            border: 'none', borderRadius: '8px', padding: '6px 10px', color: 'white',
            cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: '700', fontSize: '13px', color: '#ff4444', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live</span>
                {liveStream?.title && <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>· {liveStream.title}</span>}
              </div>
            )}
            <div style={{ borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
              <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }}
                allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Live Stream" />
            </div>
          </div>
        )}

        {!canEdit && <div className="view-only-banner">Live score updated by coaches</div>}

        {/* Game selector — the key linking piece */}
        {canEdit && (
          <button onClick={() => setShowGamePicker(true)} style={{
            width: '100%', marginBottom: '14px', padding: '12px 16px', borderRadius: '12px',
            border: scoreData.gameId ? '2px solid var(--red)' : '2px dashed var(--gray-300)',
            background: scoreData.gameId ? '#FEF2F2' : 'white',
            cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: scoreData.gameId ? 'var(--red)' : 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {scoreData.gameId ? '🔗 Game Linked' : 'No Game Selected'}
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700', color: 'var(--black)', marginTop: '2px' }}>
                {scoreData.opponent ? `vs ${scoreData.opponent}` : 'Tap to select a game'}
              </div>
              {scoreData.gameDate && (
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>{scoreData.gameDate}</div>
              )}
            </div>
            <span style={{ fontSize: '20px', color: 'var(--gray-400)' }}>›</span>
          </button>
        )}

        {/* Game Day Checklist — coaches only */}
        {isCoach && (
          <div className="card" style={{ marginBottom: '14px', padding: '12px 14px' }}>
            <button onClick={() => setChecklistOpen(o => !o)} style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Game Day Checklist
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                  background: checklist.filter(i => i.done).length === checklist.length ? '#DCFCE7' : '#FEF3C7',
                  color: checklist.filter(i => i.done).length === checklist.length ? '#16A34A' : '#92400E'
                }}>
                  {checklist.filter(i => i.done).length}/{checklist.length}
                </span>
              </div>
              <span style={{ fontSize: '18px', color: 'var(--gray-400)', transform: checklistOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
            </button>

            {checklistOpen && (
              <div style={{ marginTop: '12px' }}>
                {checklist.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: idx < checklist.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <button onClick={() => toggleCheckItem(idx)} style={{
                      width: 22, height: 22, borderRadius: '6px', flexShrink: 0, cursor: 'pointer',
                      border: item.done ? 'none' : '2px solid var(--gray-300)',
                      background: item.done ? 'var(--red)' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {item.done && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span style={{ flex: 1, fontSize: '14px', color: item.done ? 'var(--gray-400)' : 'var(--black)', textDecoration: item.done ? 'line-through' : 'none' }}>
                      {item.label}
                    </span>
                    <button onClick={() => removeCheckItem(idx)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--gray-300)', lineHeight: 1, padding: '0 2px'
                    }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <input
                    value={newCheckItem}
                    onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                    placeholder="Add item..."
                    style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1.5px solid var(--gray-200)', fontSize: '13px', outline: 'none' }}
                  />
                  <button onClick={addCheckItem} style={{
                    padding: '7px 12px', borderRadius: '8px', border: 'none',
                    background: 'var(--red)', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                  }}>Add</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Big scoreboard */}
        <div style={{ background: '#111', borderRadius: '16px', padding: '20px', marginBottom: '14px', fontFamily: 'Oswald, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--red)', fontSize: '18px', fontWeight: '700', textTransform: 'uppercase' }}>Dragons</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '56px', fontWeight: '700', color: dragonsTotal >= themTotal ? '#FFD700' : 'white', lineHeight: 1, minWidth: '50px', textAlign: 'center' }}>{dragonsTotal}</div>
              <div style={{ color: 'var(--gray-400)', fontSize: '24px' }}>–</div>
              <div style={{ fontSize: '56px', fontWeight: '700', color: themTotal > dragonsTotal ? '#FFD700' : 'white', lineHeight: 1, minWidth: '50px', textAlign: 'center' }}>{themTotal}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ color: 'var(--gray-400)', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase' }}>{scoreData.opponent || 'Opponent'}</div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '320px' }}>
              <thead>
                <tr>
                  <td style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 8px', textAlign: 'left' }}>Team</td>
                  {INNINGS.map(i => <td key={i} style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 6px', textAlign: 'center' }}>{i}</td>)}
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
                            <button onClick={() => updateScore(team.key, i, 1)} style={{ background: 'var(--gray-700)', border: 'none', borderRadius: '3px', color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>+</button>
                            <span style={{ color: 'white', fontSize: '16px', fontWeight: '700', lineHeight: 1 }}>{scoreData[team.key]?.[i - 1] || 0}</span>
                            <button onClick={() => updateScore(team.key, i, -1)} style={{ background: 'var(--gray-700)', border: 'none', borderRadius: '3px', color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>–</button>
                          </div>
                        ) : (
                          <span style={{ color: 'white', fontSize: '16px', fontWeight: '700' }}>{scoreData[team.key]?.[i - 1] || 0}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', padding: '6px 8px', color: 'white', fontSize: '18px', fontWeight: '700', borderLeft: '1px solid var(--gray-700)' }}>
                      {total(scoreData[team.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inning selector */}
          {canEdit && (
            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--gray-500)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>Inning</span>
              {INNINGS.map(i => (
                <button key={i} onClick={() => setScoringInning(i)} style={{
                  width: 28, height: 28, borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '13px',
                  background: scoringInning === i ? 'var(--red)' : 'var(--gray-700)',
                  color: scoringInning === i ? 'white' : 'var(--gray-400)',
                }}>{i}</button>
              ))}
              {scoringInning > 7 && (
                <button onClick={() => setScoringInning(scoringInning)} style={{
                  height: 28, padding: '0 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '13px',
                  background: 'var(--red)', color: 'white',
                }}>{scoringInning}</button>
              )}
              <button onClick={() => setScoringInning(s => s > 7 ? s + 1 : 8)} style={{
                height: 28, padding: '0 5px', borderRadius: '6px', border: '1px dashed var(--gray-600)', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '10px',
                background: 'transparent', color: 'var(--gray-600)',
              }}>+EI</button>
            </div>
          )}

          {/* Outs tracker */}
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--gray-500)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Outs</span>
            {canEdit ? (
              <button onClick={updateOuts} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: i < (scoreData.outs || 0) ? 'var(--red)' : 'var(--gray-700)',
                    border: `2px solid ${i < (scoreData.outs || 0) ? 'var(--red)' : 'var(--gray-600)'}`,
                    transition: 'background 0.15s'
                  }} />
                ))}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: i < (scoreData.outs || 0) ? 'var(--red)' : 'var(--gray-700)',
                    border: `2px solid ${i < (scoreData.outs || 0) ? 'var(--red)' : 'var(--gray-600)'}`
                  }} />
                ))}
              </div>
            )}
            <span style={{ color: 'var(--gray-400)', fontSize: '13px', fontWeight: '700' }}>
              {scoreData.outs || 0} {(scoreData.outs || 0) === 1 ? 'out' : 'outs'}
              {(scoreData.outs || 0) === 3 && <span style={{ color: 'var(--red)', marginLeft: '6px' }}>— Inning Over</span>}
            </span>
          </div>
        </div>

        {/* Game status */}
        <div className="card" style={{ textAlign: 'center', marginBottom: '14px' }}>
          {dragonsTotal > themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--green)', fontWeight: '700' }}>🏆 Dragons Lead {dragonsTotal}–{themTotal}</p>
          ) : dragonsTotal < themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--red)', fontWeight: '700' }}>Trailing {dragonsTotal}–{themTotal}</p>
          ) : (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--gray-500)', fontWeight: '700' }}>🤝 Tied {dragonsTotal}–{themTotal}</p>
          )}
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {scoreData.gameId && (
              <button onClick={() => setShowEndGame(true)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                background: 'var(--red)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer'
              }}>🏁 End Game & Record Result</button>
            )}
            <button className="btn-secondary" onClick={resetScore} style={{ flex: scoreData.gameId ? 0 : 1 }}>
              🔄 Reset
            </button>
          </div>
        )}

        {/* Past Games */}
        {games.filter(g => g.result).length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Past Games</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...games].filter(g => g.result).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(g => (
                <div key={g.id} style={{
                  background: 'white', border: '1px solid var(--gray-200)', borderRadius: '12px',
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '10px', flexShrink: 0,
                    background: g.result === 'W' ? '#DCFCE7' : '#FEE2E2',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: g.result === 'W' ? '#16A34A' : '#B91C1C', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.5px' }}>
                      {g.result === 'W' ? 'WIN' : 'LOSS'}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>vs {g.opponent}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {g.date && new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {g.score && <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', color: 'var(--gray-700)' }}>{typeof g.score === 'object' ? `${g.score.us}–${g.score.them}` : g.score}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Game Picker Modal */}
      {showGamePicker && (
        <div className="modal-overlay" onClick={() => setShowGamePicker(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setShowGamePicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Select Game</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '14px' }}>
              Linking a game keeps the scoreboard, stats, and schedule in sync.
            </p>

            {upcomingGames.length > 0 && (
              <>
                <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Upcoming Games</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {upcomingGames.map(g => (
                    <button key={g.id} onClick={() => loadGame(g)}
                      style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${g.id === scoreData.gameId ? 'var(--red)' : 'var(--gray-200)'}`, background: g.id === scoreData.gameId ? '#FEF2F2' : 'white', cursor: 'pointer' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px', color: g.id === scoreData.gameId ? 'var(--red)' : 'var(--black)' }}>vs {g.opponent}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>{g.date}{g.time ? ` · ${g.time}` : ''}{g.location ? ` · ${g.location}` : ''}</div>
                      {g.id === scoreData.gameId && <div style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '700', marginTop: '3px' }}>✓ Currently loaded</div>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {recentGames.length > 0 && (
              <>
                <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Recent Games</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {recentGames.map(g => (
                    <button key={g.id} onClick={() => loadGame(g)}
                      style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--gray-200)', background: 'white', cursor: 'pointer', opacity: 0.75 }}>
                      <div style={{ fontWeight: '700', fontSize: '14px' }}>vs {g.opponent}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                        {g.date}
                        {g.result && <span style={{ marginLeft: '6px', fontWeight: '700', color: g.result === 'W' ? '#16A34A' : '#B91C1C' }}>{g.result}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {upcomingGames.length === 0 && recentGames.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px', padding: '20px 0' }}>No games on the schedule yet. Add games in the Schedule tab first.</p>
            )}
          </div>
        </div>
      )}

      {/* End Game / Record Result Modal */}
      {showEndGame && (
        <div className="modal-overlay" onClick={() => setShowEndGame(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px', textTransform: 'uppercase' }}>End Game</h3>
            <div style={{ background: '#111', borderRadius: '12px', padding: '16px', textAlign: 'center', marginBottom: '20px', fontFamily: 'Oswald, sans-serif' }}>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '6px' }}>Final Score</div>
              <div style={{ fontSize: '40px', fontWeight: '700', color: 'white' }}>
                <span style={{ color: 'var(--red)' }}>{dragonsTotal}</span>
                <span style={{ color: 'var(--gray-500)', margin: '0 12px' }}>–</span>
                <span>{themTotal}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '6px' }}>
                Dragons vs {scoreData.opponent}
              </div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px', textAlign: 'center' }}>
              Record this result to the schedule and season record?
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => recordResult('W')} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                background: '#DCFCE7', color: '#16A34A', fontWeight: '700', fontSize: '16px', cursor: 'pointer'
              }}>🏆 Win</button>
              <button onClick={() => recordResult('L')} style={{
                flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                background: '#FEE2E2', color: '#B91C1C', fontWeight: '700', fontSize: '16px', cursor: 'pointer'
              }}>Loss</button>
            </div>
            <button className="btn-secondary" onClick={() => setShowEndGame(false)} style={{ marginTop: '8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stream setup modal */}
      {streamModal && (
        <div className="modal-overlay" onClick={() => setStreamModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Live Stream Setup</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
              Start a free YouTube Live stream from the YouTube Studio app, then paste the URL below.
            </p>
            <div className="form-group">
              <label className="form-label">YouTube URL</label>
              <input className="form-input" value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://youtube.com/live/..." />
              {streamUrl && !getYouTubeId(streamUrl) && <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px' }}>Couldn't find a YouTube video ID in that URL.</p>}
              {streamUrl && getYouTubeId(streamUrl) && <p style={{ fontSize: '12px', color: '#16A34A', marginTop: '4px' }}>✓ Valid YouTube URL</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Label (optional)</label>
              <input className="form-input" value={streamTitle} onChange={e => setStreamTitle(e.target.value)} placeholder="e.g. vs. Blue Jays — Apr 7" />
            </div>
            <button className="btn-primary" onClick={saveStream} style={{ marginBottom: '8px' }}>Save Stream</button>
            {liveStream?.url && (
              <button onClick={toggleLive} style={{ width: '100%', marginBottom: '8px', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '15px', border: 'none', background: liveStream?.isLive ? '#DCFCE7' : '#FEE2E2', color: liveStream?.isLive ? '#16A34A' : '#B91C1C' }}>
                {liveStream?.isLive ? '⏹ Go Offline' : '🔴 Go Live'}
              </button>
            )}
            {liveStream?.url && <button className="btn-secondary" onClick={clearStream} style={{ color: 'var(--red)' }}>Clear Stream</button>}
          </div>
        </div>
      )}

      {showLogStats && (
        <LogGameModal
          players={players}
          currentYear={currentYear}
          games={[]}
          initialGame={activeGame}
          liveScore={{ dragons: dragonsTotal, them: themTotal, opponent: scoreData.opponent, outs: scoreData.outs || 0, inning: scoringInning }}
          onScoreAdjust={(team, delta) => updateScore(team, scoringInning, delta)}
          onOutsChange={updateOuts}
          onInningChange={setScoringInning}
          onClose={() => setShowLogStats(false)}
          onSaved={msg => { setToast(msg); setShowLogStats(false); }}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
