import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const POSITIONS = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const ROTATIONS = [
  { label: 'Inn 1-2', key: 'rot1' },
  { label: 'Inn 3-4', key: 'rot2' },
  { label: 'Inn 5-6', key: 'rot3' },
  { label: 'Inn 7', key: 'rot4' }
];

// Field diagram positions (% based)
const FIELD_POSITIONS = {
  'Pitcher': { top: '52%', left: '50%' },
  'Catcher': { top: '78%', left: '50%' },
  '1st Base': { top: '52%', left: '72%' },
  '2nd Base': { top: '36%', left: '60%' },
  '3rd Base': { top: '52%', left: '28%' },
  'Shortstop': { top: '36%', left: '40%' },
  'Left Field': { top: '18%', left: '20%' },
  'Left Center': { top: '12%', left: '38%' },
  'Right Center': { top: '12%', left: '62%' },
  'Right Field': { top: '18%', left: '80%' }
};

export default function DefensiveRotation() {
  const { isCoach } = useAuth();
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [rotation, setRotation] = useState({});
  const [activeRot, setActiveRot] = useState('rot1');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'roster'), orderBy('createdAt')), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    const gamesQ = query(collection(db, 'games'), orderBy('date'));
    unsubs.push(onSnapshot(gamesQ, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    const load = async () => {
      const key = selectedGame || 'default';
      const snap = await getDoc(doc(db, 'defensiveRotations', key));
      if (snap.exists()) setRotation(snap.data().rotation || {});
      else setRotation({});
    };
    load();
  }, [selectedGame]);

  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';

  const assignPosition = (rotKey, position, playerId) => {
    setRotation(r => ({
      ...r,
      [rotKey]: { ...(r[rotKey] || {}), [position]: playerId }
    }));
  };

  const saveRotation = async () => {
    const key = selectedGame || 'default';
    await setDoc(doc(db, 'defensiveRotations', key), {
      rotation, gameId: selectedGame || null, savedAt: new Date().toISOString()
    });
    setToast('Rotation saved!');
  };

  const currentRotation = rotation[activeRot] || {};
  const assignedPlayerIds = Object.values(currentRotation).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Field Rotation" back="/" />

      <div className="page-content">
        {!isCoach && <div className="view-only-banner">👁 View Only</div>}

        <div className="form-group">
          <label className="form-label">Game (optional)</label>
          <select className="form-select" value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
            <option value="">Default Rotation</option>
            {games.map(g => (
              <option key={g.id} value={g.id}>
                {new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} vs {g.opponent}
              </option>
            ))}
          </select>
        </div>

        {/* Rotation Tabs */}
        <div className="tabs">
          {ROTATIONS.map(r => (
            <button key={r.key} className={`tab ${activeRot === r.key ? 'active' : ''}`} onClick={() => setActiveRot(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Baseball Field Diagram */}
        <div className="card" style={{ marginBottom: '14px', padding: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', textAlign: 'center', marginBottom: '8px', fontWeight: '600' }}>
            FIELD DIAGRAM — {ROTATIONS.find(r => r.key === activeRot)?.label}
          </div>
          <div style={{
            position: 'relative', width: '100%', paddingBottom: '90%',
            background: '#2D7D32', borderRadius: '50% 50% 10px 10px / 30% 30% 10px 10px',
            overflow: 'hidden'
          }}>
            {/* Infield dirt */}
            <div style={{
              position: 'absolute', bottom: '15%', left: '50%',
              transform: 'translateX(-50%)',
              width: '45%', paddingBottom: '45%',
              background: '#C2956C', borderRadius: '50%',
              opacity: 0.6
            }} />
            {/* Home plate area */}
            <div style={{
              position: 'absolute', bottom: '8%', left: '50%',
              transform: 'translateX(-50%)',
              width: '18%', paddingBottom: '12%',
              background: '#C2956C', borderRadius: '4px',
              opacity: 0.8
            }} />
            {/* Base paths */}
            <div style={{
              position: 'absolute', bottom: '20%', left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '20%', paddingBottom: '20%',
              border: '2px solid rgba(255,255,255,0.4)',
              background: 'transparent'
            }} />

            {/* Player positions */}
            {POSITIONS.map(pos => {
              const coords = FIELD_POSITIONS[pos];
              const playerId = currentRotation[pos];
              const player = players.find(p => p.id === playerId);
              return (
                <div key={pos} style={{
                  position: 'absolute',
                  top: coords.top, left: coords.left,
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center', zIndex: 2
                }}>
                  <div style={{
                    background: player ? 'var(--red)' : 'rgba(0,0,0,0.4)',
                    border: '2px solid rgba(255,255,255,0.7)',
                    borderRadius: '50%',
                    width: player ? 36 : 28, height: player ? 36 : 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: player ? '9px' : '8px',
                    fontWeight: '700', fontFamily: 'Oswald, sans-serif',
                    whiteSpace: 'nowrap',
                    cursor: 'default'
                  }}>
                    {player ? (getPlayerName(player).split(' ')[0].substring(0, 6)) : pos.substring(0, 3)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Position Assignments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {POSITIONS.map(pos => {
            const assignedId = currentRotation[pos] || '';
            return (
              <div key={pos} style={{
                background: 'white', border: '1px solid var(--gray-200)',
                borderRadius: '10px', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '8px',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '700', color: 'var(--red)',
                  fontFamily: 'Oswald, sans-serif', textAlign: 'center',
                  lineHeight: '1.2', flexShrink: 0
                }}>{pos.replace(' ', '\n').substring(0, 5)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px' }}>
                    {pos}
                  </div>
                  {isCoach ? (
                    <select
                      className="form-select"
                      value={assignedId}
                      onChange={e => assignPosition(activeRot, pos, e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '14px' }}
                    >
                      <option value="">-- Unassigned --</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id} disabled={assignedPlayerIds.includes(p.id) && assignedId !== p.id}>
                          {getPlayerName(p)}{p.jerseyNumber ? ` #${p.jerseyNumber}` : ''}
                          {assignedPlayerIds.includes(p.id) && assignedId !== p.id ? ' (assigned)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>
                      {assignedId ? getPlayerName(players.find(p => p.id === assignedId)) : 'Unassigned'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isCoach && (
          <button className="btn-primary" onClick={saveRotation} style={{ marginTop: '16px' }}>
            💾 Save Rotation
          </button>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
