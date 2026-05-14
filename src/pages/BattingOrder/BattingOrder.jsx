import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, doc, setDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const FIELDING_POSITIONS = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop',
  'Left Field','Left Center','Right Center','Right Field'];

function fitScore(statsData, position) {
  const f = statsData?.fielding?.[position];
  if (!f || !f.innings) return 0;
  const playsPerInning = ((f.putouts || 0) * 0.60 + (f.assists || 0) * 0.40) / f.innings;
  const playScore    = Math.min(1.0, playsPerInning / 0.5);
  const rawScore     = 0.45 + playScore * 0.55;
  const errorPenalty = Math.max(0.05, 1 - (f.errors / f.innings) * 3.0);
  const inningsMult  = Math.min(1.0, 0.50 + f.innings / 15);
  return rawScore * errorPenalty * inningsMult;
}

function fitColor(score) {
  if (score >= 0.60) return '#16A34A';
  if (score >= 0.30) return '#D97706';
  if (score >  0   ) return '#DC2626';
  return 'var(--gray-300)';
}

export default function BattingOrder() {
  const { isCoach } = useAuth();
  const [searchParams] = useSearchParams();
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(searchParams.get('gameId') || '');
  const [order, setOrder] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [fieldLineup, setFieldLineup] = useState({});
  const [absentIds, setAbsentIds] = useState(new Set());
  const [toast, setToast] = useState('');

  const YEAR = new Date().getFullYear();

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'roster'), orderBy('createdAt')), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'games'), orderBy('date')), snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    setFieldLineup({});
    setAbsentIds(new Set());
    const load = async () => {
      const [defaultOrderSnap, gameOrderSnap, defaultFieldSnap, gameFieldSnap, attSnap] = await Promise.all([
        getDoc(doc(db, 'battingOrders', 'default')),
        selectedGame ? getDoc(doc(db, 'battingOrders', selectedGame)) : Promise.resolve(null),
        getDoc(doc(db, 'liveLineups', 'default')),
        selectedGame ? getDoc(doc(db, 'liveLineups', selectedGame)) : Promise.resolve(null),
        selectedGame ? getDocs(query(collection(db, 'attendance'), where('sourceId', '==', selectedGame))) : Promise.resolve(null),
      ]);
      // Use game-specific order if it exists, otherwise fall back to master
      const orderSnap = (gameOrderSnap?.exists() && gameOrderSnap.data().order?.length) ? gameOrderSnap : defaultOrderSnap;
      setOrder(orderSnap.exists() && orderSnap.data().order?.length
        ? orderSnap.data().order
        : players.map(p => p.id));
      // Use game-specific field positions if they exist, otherwise fall back to master
      const fieldSnap = (gameFieldSnap?.exists() && Object.keys(gameFieldSnap.data().innings?.['1'] || {}).length)
        ? gameFieldSnap : defaultFieldSnap;
      setFieldLineup(fieldSnap?.exists() ? (fieldSnap.data().innings?.['1'] || {}) : {});
      if (attSnap && !attSnap.empty) {
        const records = attSnap.docs[0].data().records || {};
        setAbsentIds(new Set(Object.entries(records).filter(([, v]) => v === 'absent').map(([id]) => id)));
      }
    };
    load();
  }, [selectedGame, players]); // eslint-disable-line

  useEffect(() => {
    if (!players.length) return;
    Promise.all(players.map(p =>
      getDoc(doc(db, 'playerStats', p.id)).then(snap => ({ id: p.id, data: snap.exists() ? snap.data() : null }))
    )).then(results => {
      const stats = {};
      results.forEach(r => { if (r.data) stats[r.id] = r.data; });
      setAllStats(stats);
    });
  }, [players]); // eslint-disable-line

  const getPlayer = (id) => players.find(p => p.id === id);
  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';

  const getStatLine = (playerId) => {
    const s = allStats[playerId];
    if (!s) return null;
    const avg = s.seasons?.[YEAR]?.avg ?? s.career?.avg;
    const obp = s.seasons?.[YEAR]?.obp ?? s.career?.obp;
    if (avg == null && obp == null) return null;
    const fmtAvg = avg != null ? `.${Math.round(avg * 1000).toString().padStart(3, '0')}` : null;
    const fmtObp = obp != null ? `.${Math.round(obp * 1000).toString().padStart(3, '0')}` : null;
    return [fmtAvg && `AVG ${fmtAvg}`, fmtObp && `OBP ${fmtObp}`].filter(Boolean).join('  ·  ');
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newOrder = Array.from(order);
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setOrder(newOrder);
  };

  const saveBattingOrder = async () => {
    const now = new Date().toISOString();
    if (!selectedGame) {
      await Promise.all([
        setDoc(doc(db, 'battingOrders', 'default'), { order, savedAt: now }),
        ...games.map(g => setDoc(doc(db, 'battingOrders', g.id), { order, savedAt: now })),
      ]);
      setToast(`Batting order saved & copied to ${games.length} game${games.length !== 1 ? 's' : ''}!`);
    } else {
      await setDoc(doc(db, 'battingOrders', selectedGame), { order, savedAt: now });
      setToast('Batting order saved!');
    }
  };

  const saveFieldPositions = async () => {
    const now = new Date().toISOString();
    if (!selectedGame) {
      await Promise.all([
        setDoc(doc(db, 'liveLineups', 'default'), { innings: { '1': fieldLineup } }, { merge: true }),
        ...games.map(g => setDoc(doc(db, 'liveLineups', g.id), { innings: { '1': fieldLineup } }, { merge: true })),
      ]);
      setToast(`Field positions saved & copied to ${games.length} game${games.length !== 1 ? 's' : ''}!`);
    } else {
      const existingSnap = await getDoc(doc(db, 'liveLineups', selectedGame));
      const existingInnings = existingSnap.exists() ? (existingSnap.data().innings || {}) : {};
      await setDoc(doc(db, 'liveLineups', selectedGame), {
        innings: { ...existingInnings, '1': fieldLineup }
      }, { merge: true });
      setToast('Field positions saved!');
    }
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newOrder = [...order];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrder(newOrder);
  };

  const moveDown = (index) => {
    if (index === order.length - 1) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrder(newOrder);
  };

  const sortedPlayers = [...players].sort((a, b) =>
    parseInt(a.jerseyNumber || 99) - parseInt(b.jerseyNumber || 99)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Starting Lineup" back="/" />

      <div className="page-content">
        {!isCoach && <div className="view-only-banner">👁 View Only</div>}

        <div className="form-group">
          <label className="form-label">Lineup</label>
          <select className="form-select" value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
            <option value="">Master Lineup</option>
            {games.filter(g => g.date && g.date >= new Date().toISOString().slice(0, 10)).map(g => (
              <option key={g.id} value={g.id}>
                {new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} vs {g.opponent}
              </option>
            ))}
          </select>
        </div>

        {/* Batting Order */}
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          Batting Order
        </div>

        {order.length === 0 ? (
          <div className="empty-state">
            <p>No players on roster yet.</p>
          </div>
        ) : isCoach ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="batting-order">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {order.map((playerId, index) => {
                    const player = getPlayer(playerId);
                    if (!player) return null;
                    const statLine = getStatLine(playerId);
                    const isAbsent = absentIds.has(playerId);
                    return (
                      <Draggable key={playerId} draggableId={playerId} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging ? '#FFF5F5' : isAbsent ? '#FFF5F5' : 'white',
                              border: `1px solid ${snapshot.isDragging ? 'var(--red)' : isAbsent ? '#FECACA' : 'var(--gray-200)'}`,
                              borderRadius: '10px', padding: '12px 14px',
                              marginBottom: '8px', display: 'flex',
                              alignItems: 'center', gap: '12px',
                              boxShadow: snapshot.isDragging ? '0 4px 16px rgba(204,27,27,0.2)' : 'none'
                            }}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: 'var(--red)', color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px',
                              flexShrink: 0
                            }}>{index + 1}</div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: '700', fontSize: '15px' }}>{getPlayerName(player)}</div>
                              <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                                {player.position && `${player.position}`}
                                {player.jerseyNumber && ` · #${player.jerseyNumber}`}
                              </div>
                              {statLine && (
                                <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px', fontWeight: '600' }}>
                                  {statLine}
                                </div>
                              )}
                            </div>

                            {isAbsent && (
                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px',
                                borderRadius: '6px', background: '#FEE2E2', color: '#DC2626', flexShrink: 0 }}>
                                ⚠️ Absent
                              </span>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button onClick={() => moveUp(index)} style={{
                                background: 'var(--gray-100)', border: 'none', borderRadius: '4px',
                                width: 28, height: 24, cursor: 'pointer', fontSize: '12px'
                              }}>▲</button>
                              <button onClick={() => moveDown(index)} style={{
                                background: 'var(--gray-100)', border: 'none', borderRadius: '4px',
                                width: 28, height: 24, cursor: 'pointer', fontSize: '12px'
                              }}>▼</button>
                            </div>

                            <div {...provided.dragHandleProps} style={{
                              color: 'var(--gray-300)', cursor: 'grab', padding: '4px'
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                                <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                              </svg>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {order.map((playerId, index) => {
              const player = getPlayer(playerId);
              if (!player) return null;
              const statLine = getStatLine(playerId);
              const isAbsent = absentIds.has(playerId);
              return (
                <div key={playerId} style={{
                  background: isAbsent ? '#FFF5F5' : 'white',
                  border: `1px solid ${isAbsent ? '#FECACA' : 'var(--gray-200)'}`,
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--red)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px', flexShrink: 0
                  }}>{index + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>{getPlayerName(player)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                      {player.position}{player.jerseyNumber ? ` · #${player.jerseyNumber}` : ''}
                    </div>
                    {statLine && (
                      <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px', fontWeight: '600' }}>
                        {statLine}
                      </div>
                    )}
                  </div>
                  {isAbsent && (
                    <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px',
                      borderRadius: '6px', background: '#FEE2E2', color: '#DC2626', flexShrink: 0 }}>
                      ⚠️ Absent
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isCoach && order.length > 0 && (
          <button className="btn-primary" onClick={saveBattingOrder} style={{ marginTop: '10px' }}>
            {selectedGame ? '💾 Save Batting Order' : '💾 Save Master Batting Order'}
          </button>
        )}

        {/* Starting Field Positions */}
        <div style={{ marginTop: '24px', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Starting Field Positions
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '12px' }}>
            Dot color = best fit at that position · green = strong · amber = ok · red = weak
          </div>

          {FIELDING_POSITIONS.map(pos => {
            const assignedId = fieldLineup[pos] || '';
            const score = assignedId ? fitScore(allStats[assignedId], pos) : 0;
            const color  = assignedId ? fitColor(score) : 'var(--gray-200)';
            return (
              <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color, flexShrink: 0
                }} />
                {assignedId && absentIds.has(assignedId) && (
                  <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '700', flexShrink: 0 }}>⚠️</span>
                )}
                <span style={{ fontSize: '13px', fontWeight: '700', minWidth: '110px', color: 'var(--gray-700)' }}>
                  {pos}
                </span>
                <select
                  disabled={!isCoach}
                  value={assignedId}
                  onChange={e => setFieldLineup(fl => {
                    const next = { ...fl };
                    if (e.target.value) next[pos] = e.target.value;
                    else delete next[pos];
                    return next;
                  })}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '8px',
                    border: `1.5px solid ${color}`, fontSize: '13px',
                    background: 'white', color: 'var(--black)'
                  }}
                >
                  <option value="">— Not playing —</option>
                  {sortedPlayers.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.jerseyNumber || '—'} {getPlayerName(p)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {isCoach && (
          <button className="btn-primary" onClick={saveFieldPositions} style={{ marginTop: '8px' }}>
            {selectedGame ? '💾 Save Field Positions' : '💾 Save Master Field Positions'}
          </button>
        )}

        <div className="card" style={{ marginTop: '16px', background: '#FFF5F5', border: '1px solid #FECACA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span>🤖</span>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', textTransform: 'uppercase', color: 'var(--red)' }}>
              AI Lineup Recommendations
            </span>
            <span style={{ background: '#7C3AED', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '700' }}>
              COMING SOON
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            Claude AI will optimize your batting order based on player stats and matchups.
          </p>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
