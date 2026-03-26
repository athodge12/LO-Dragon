import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const RELATIONSHIPS = ['Mom','Dad','Step-Mom','Step-Dad','Grandparent','Brother','Sister','Aunt','Uncle','Guardian','Family Friend','Other'];

export default function Roster() {
  const { isCoach, isFan, currentUser, userProfile } = useAuth();
  const canClaim = !isFan;
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('players');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ name: '', jerseyNumber: '' });
  const [claimModal, setClaimModal] = useState(null);
  const [claimRelationship, setClaimRelationship] = useState('');

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

  // claimedBy is a map: { [uid]: displayName }
  const getClaimedBy = (player) => player.claimedBy && typeof player.claimedBy === 'object' ? player.claimedBy : {};

  const claimPlayer = async (player) => {
    const name = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim();
    const existing = getClaimedBy(player);
    await setDoc(doc(db, 'roster', player.id), {
      ...player,
      claimedBy: { ...existing, [currentUser.uid]: { name, relationship: claimRelationship } }
    });
    setToast('Player claimed!');
    setClaimModal(null);
    setClaimRelationship('');
  };

  const unclaimPlayer = async (player) => {
    if (!window.confirm('Remove your claim on this player?')) return;
    const existing = { ...getClaimedBy(player) };
    delete existing[currentUser.uid];
    await setDoc(doc(db, 'roster', player.id), { ...player, claimedBy: existing });
    setToast('Claim removed');
  };

  const myClaimedPlayers = players.filter(p => currentUser?.uid && getClaimedBy(p)[currentUser.uid] !== undefined);

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
        {/* My claimed players banner */}
        {canClaim && myClaimedPlayers.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', color: 'white'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              My Player{myClaimedPlayers.length > 1 ? 's' : ''}
            </div>
            {myClaimedPlayers.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px', flexShrink: 0
                }}>
                  {p.jerseyNumber || getInitials(p.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{p.name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    {p.jerseyNumber ? `#${p.jerseyNumber}` : ''}
                    {p.positions?.length ? ` · ${p.positions.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/roster/${p.id}`)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '6px 12px', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                >Profile →</button>
              </div>
            ))}
          </div>
        )}

        {/* No claim yet */}
        {canClaim && myClaimedPlayers.length === 0 && (
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
                const claimedByMap = getClaimedBy(player);
                const isMineClaimed = !!claimedByMap[currentUser?.uid];
                const claimedEntries = Object.values(claimedByMap);
                const isClaimed = claimedEntries.length > 0;
                const claimedLabel = claimedEntries.map(e =>
                  typeof e === 'object' ? `${e.relationship ? e.relationship + ': ' : ''}${e.name}` : e
                ).join(', ');
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
                              ✅ {claimedLabel}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--gray-400)' }}>Unclaimed</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {/* Claim/unclaim */}
                        {canClaim && (
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

      {/* Claim Modal */}
      {claimModal && (
        <div className="modal-overlay" onClick={() => { setClaimModal(null); setClaimRelationship(''); }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Claim Player</h3>
            <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              Linking your account to <strong>{claimModal.name}</strong>
            </p>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Your relationship to {claimModal.name}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {RELATIONSHIPS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setClaimRelationship(r)}
                    style={{
                      padding: '8px 14px', borderRadius: '20px', cursor: 'pointer',
                      border: `2px solid ${claimRelationship === r ? 'var(--red)' : 'var(--gray-200)'}`,
                      background: claimRelationship === r ? '#FEF2F2' : 'white',
                      color: claimRelationship === r ? 'var(--red)' : 'var(--gray-600)',
                      fontWeight: claimRelationship === r ? '700' : '400', fontSize: '14px'
                    }}
                  >{r}</button>
                ))}
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={() => claimPlayer(claimModal)}
              disabled={!claimRelationship}
            >Claim Player</button>
            <button className="btn-secondary" onClick={() => { setClaimModal(null); setClaimRelationship(''); }} style={{ marginTop: '8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
