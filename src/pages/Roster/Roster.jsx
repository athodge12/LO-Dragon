import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

export default function Roster() {
  const { isCoach, currentUser, userProfile } = useAuth();
  const isParent = userProfile?.role === 'parent' || userProfile?.roles?.includes('parent');
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('players');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ name: '', jerseyNumber: '' });
  const [claimModal, setClaimModal] = useState(null);

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'roster'), orderBy('createdAt')), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const hasRole = (m, r) => m.role === r || (Array.isArray(m.roles) && m.roles.includes(r));
      setCoaches(all.filter(m => hasRole(m, 'coach') || hasRole(m, 'admin')));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const addPlayer = async () => {
    if (!form.name.trim()) return;
    await addDoc(collection(db, 'roster'), {
      name: form.name.trim(),
      jerseyNumber: form.jerseyNumber,
      positions: [],
      claimedBy: null,
      claimedByName: null,
      createdAt: new Date().toISOString()
    });
    setForm({ name: '', jerseyNumber: '' });
    setModal(false);
    setToast('Player added!');
  };

  const removePlayer = async (id) => {
    if (!window.confirm('Remove this player from the roster?')) return;
    await deleteDoc(doc(db, 'roster', id));
    setToast('Player removed');
  };

  const claimPlayer = async (player) => {
    const name = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim();
    await setDoc(doc(db, 'roster', player.id), {
      ...player,
      claimedBy: currentUser.uid,
      claimedByName: name
    });
    setToast('Player claimed!');
    setClaimModal(null);
  };

  const unclaimPlayer = async (player) => {
    if (!window.confirm('Remove your claim on this player?')) return;
    await setDoc(doc(db, 'roster', player.id), {
      ...player,
      claimedBy: null,
      claimedByName: null
    });
    setToast('Claim removed');
  };

  const myClaimedPlayer = players.find(p => p.claimedBy === currentUser?.uid);

  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Roster" actions={isCoach && (
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
        {/* Parent: my claimed player banner */}
        {isParent && myClaimedPlayer && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '12px', color: 'white'
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '18px', flexShrink: 0
            }}>
              {myClaimedPlayer.jerseyNumber || getInitials(myClaimedPlayer.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '16px' }}>{myClaimedPlayer.name}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {myClaimedPlayer.jerseyNumber ? `#${myClaimedPlayer.jerseyNumber}` : ''}
                {myClaimedPlayer.positions?.length ? ` · ${myClaimedPlayer.positions.join(', ')}` : ''}
              </div>
            </div>
            <button
              onClick={() => navigate(`/roster/${myClaimedPlayer.id}`)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '6px 12px', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
            >Profile →</button>
          </div>
        )}

        {/* Parent: no claim yet */}
        {isParent && !myClaimedPlayer && (
          <div style={{
            background: '#FFF5F5', border: '1px solid #FECACA',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <span style={{ fontSize: '24px' }}>👆</span>
            <p style={{ fontSize: '14px', color: '#B91C1C', fontWeight: '600' }}>
              Tap <strong>Claim</strong> next to your player below to link your account.
            </p>
          </div>
        )}

        <div className="tabs">
          <button className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>
            Players ({players.length})
          </button>
          <button className={`tab ${tab === 'coaches' ? 'active' : ''}`} onClick={() => setTab('coaches')}>
            Coaches ({coaches.length})
          </button>
        </div>

        {tab === 'players' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {players.length === 0 ? (
              <div className="empty-state">
                <p>{isCoach ? 'No players yet. Tap + to add.' : 'No players on the roster yet.'}</p>
              </div>
            ) : (
              players.map(player => {
                const isMineClaimed = player.claimedBy === currentUser?.uid;
                const isClaimed = !!player.claimedBy;
                return (
                  <div key={player.id} className="card" style={{
                    padding: '12px 14px',
                    border: isMineClaimed ? '2px solid var(--red)' : '1px solid var(--gray-200)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={() => navigate(`/roster/${player.id}`)}
                        style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: 'var(--red)', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'Oswald, sans-serif', fontSize: '18px', fontWeight: '700',
                          border: 'none', cursor: 'pointer', flexShrink: 0
                        }}
                      >
                        {player.jerseyNumber || getInitials(player.name)}
                      </button>

                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/roster/${player.id}`)}>
                        <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--black)' }}>
                          {player.name}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
                          {player.jerseyNumber ? `#${player.jerseyNumber}` : ''}
                          {player.positions?.length ? ` · ${player.positions.slice(0,2).join(', ')}` : ''}
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '2px' }}>
                          {isClaimed ? (
                            <span style={{ color: '#16A34A', fontWeight: '600' }}>
                              ✅ {isMineClaimed ? 'Your player' : player.claimedByName}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--gray-400)' }}>Unclaimed</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {/* Parent claim/unclaim */}
                        {isParent && !isCoach && (
                          isMineClaimed ? (
                            <button onClick={() => unclaimPlayer(player)} style={{
                              padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
                              border: '1.5px solid #FECACA', background: '#FEF2F2',
                              color: 'var(--red)', fontWeight: '600', fontSize: '12px'
                            }}>Unclaim</button>
                          ) : !isClaimed ? (
                            <button onClick={() => setClaimModal(player)} style={{
                              padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
                              border: '1.5px solid var(--red)', background: '#FEF2F2',
                              color: 'var(--red)', fontWeight: '700', fontSize: '12px'
                            }}>Claim</button>
                          ) : null
                        )}
                        {/* Coach remove */}
                        {isCoach && (
                          <button onClick={() => removePlayer(player.id)} style={{
                            background: 'none', border: 'none', color: 'var(--gray-400)',
                            cursor: 'pointer', fontSize: '20px', padding: '4px'
                          }}>×</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'coaches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {coaches.length === 0 ? (
              <div className="empty-state"><p>No coaches found.</p></div>
            ) : (
              coaches.map(coach => (
                <div key={coach.id} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="avatar" style={{ width: 48, height: 48, fontSize: '18px' }}>
                      {getInitials(`${coach.firstName || ''} ${coach.lastName || ''}`)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{coach.firstName} {coach.lastName}</span>
                        <span className="badge-coach">Coach</span>
                      </div>
                      {coach.phone && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>📞 {coach.phone}</div>}
                      {coach.email && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>{coach.email}</div>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Player Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>Add Player</h3>
            <div className="form-group">
              <label className="form-label">Player Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="First and last name" />
            </div>
            <div className="form-group">
              <label className="form-label">Jersey #</label>
              <input className="form-input" type="number" value={form.jerseyNumber} onChange={e => setForm(f => ({ ...f, jerseyNumber: e.target.value }))} placeholder="00" />
            </div>
            <button className="btn-primary" onClick={addPlayer} style={{ marginTop: '16px' }}>Add Player</button>
          </div>
        </div>
      )}

      {/* Claim Confirm Modal */}
      {claimModal && (
        <div className="modal-overlay" onClick={() => setClaimModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px', textTransform: 'uppercase' }}>Claim Player</h3>
            <p style={{ fontSize: '15px', color: 'var(--gray-600)', marginBottom: '20px', lineHeight: '1.5' }}>
              Are you the parent of <strong>{claimModal.name}</strong>? This will link your account to this player.
            </p>
            <button className="btn-primary" onClick={() => claimPlayer(claimModal)}>Yes, That's My Player</button>
            <button className="btn-secondary" onClick={() => setClaimModal(null)} style={{ marginTop: '8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
