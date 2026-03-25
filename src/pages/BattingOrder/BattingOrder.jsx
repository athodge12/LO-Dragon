import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function BattingOrder() {
  const { isCoach } = useAuth();
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [order, setOrder] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    const usersQ = query(collection(db, 'users'), orderBy('createdAt'));
    unsubs.push(onSnapshot(usersQ, snap => {
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(members.filter(m => m.role === 'parent' || m.role === 'player'));
    }));
    const gamesQ = query(collection(db, 'games'), orderBy('date'));
    unsubs.push(onSnapshot(gamesQ, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    if (!selectedGame) { setOrder(players.map(p => p.id)); return; }
    const load = async () => {
      const snap = await getDoc(doc(db, 'battingOrders', selectedGame));
      if (snap.exists() && snap.data().order?.length) {
        setOrder(snap.data().order);
      } else {
        setOrder(players.map(p => p.id));
      }
    };
    load();
  }, [selectedGame, players]);

  const getPlayer = (id) => players.find(p => p.id === id);
  const getPlayerName = (p) => p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newOrder = Array.from(order);
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setOrder(newOrder);
  };

  const saveOrder = async () => {
    const key = selectedGame || 'default';
    await setDoc(doc(db, 'battingOrders', key), {
      order,
      gameId: selectedGame || null,
      savedAt: new Date().toISOString()
    });
    setToast('Batting order saved!');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Batting Order" back="/" />

      <div className="page-content">
        {!isCoach && <div className="view-only-banner">👁 View Only</div>}

        <div className="form-group">
          <label className="form-label">Game (optional)</label>
          <select className="form-select" value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>
            <option value="">Default Order</option>
            {games.map(g => (
              <option key={g.id} value={g.id}>
                {new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} vs {g.opponent}
              </option>
            ))}
          </select>
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
                    return (
                      <Draggable key={playerId} draggableId={playerId} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging ? '#FFF5F5' : 'white',
                              border: `1px solid ${snapshot.isDragging ? 'var(--red)' : 'var(--gray-200)'}`,
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
                            </div>

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
              return (
                <div key={playerId} style={{
                  background: 'white', border: '1px solid var(--gray-200)',
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--red)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px', flexShrink: 0
                  }}>{index + 1}</div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>{getPlayerName(player)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                      {player.position}{player.jerseyNumber ? ` · #${player.jerseyNumber}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isCoach && order.length > 0 && (
          <button className="btn-primary" onClick={saveOrder} style={{ marginTop: '16px' }}>
            💾 Save Batting Order
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
