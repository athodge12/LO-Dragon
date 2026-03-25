import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

export default function Roster() {
  const { isCoach, userProfile } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('players');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ childName: '', jerseyNumber: '', position: '', parentName: '', phone: '' });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt'));
    return onSnapshot(q, snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const coaches = members.filter(m => m.role === 'coach');
  const players = members.filter(m => m.role === 'parent' || m.role === 'player');

  const addPlayer = async () => {
    if (!form.childName) return;
    await addDoc(collection(db, 'users'), {
      ...form,
      role: 'player',
      createdAt: new Date().toISOString()
    });
    setForm({ childName: '', jerseyNumber: '', position: '', parentName: '', phone: '' });
    setModal(false);
    setToast('Player added!');
  };

  const removePlayer = async (id) => {
    if (!window.confirm('Remove this player?')) return;
    await deleteDoc(doc(db, 'users', id));
    setToast('Player removed');
  };

  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
  const getPlayerName = (m) => m.childName || `${m.firstName || ''} ${m.lastName || ''}`.trim();

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
        {!isCoach && <div className="view-only-banner">👁 View Only — Contact your coach for changes</div>}

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
                <p>No players yet. Parents register to appear here.</p>
              </div>
            ) : (
              players.map(player => (
                <div key={player.id} className="card" style={{ padding: '12px 14px' }}>
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
                      {player.jerseyNumber || getInitials(getPlayerName(player))}
                    </button>
                    <div style={{ flex: 1 }} onClick={() => navigate(`/roster/${player.id}`)} role="button" style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--black)' }}>
                        {getPlayerName(player)}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
                        {player.position && `${player.position}`}
                        {player.jerseyNumber && ` · #${player.jerseyNumber}`}
                      </div>
                      {(player.firstName || player.parentName) && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
                          Parent: {player.parentName || `${player.firstName} ${player.lastName}`}
                        </div>
                      )}
                    </div>
                    {isCoach && (
                      <button onClick={() => removePlayer(player.id)} style={{
                        background: 'none', border: 'none', color: 'var(--gray-400)',
                        cursor: 'pointer', fontSize: '20px', padding: '4px'
                      }}>×</button>
                    )}
                  </div>
                </div>
              ))
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
                      {getInitials(`${coach.firstName} ${coach.lastName}`)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>
                          {coach.firstName} {coach.lastName}
                        </span>
                        <span className="badge-coach">Coach</span>
                      </div>
                      {coach.phone && (
                        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
                          📞 {coach.phone}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
                        {coach.email}
                      </div>
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
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Add Player
            </h3>
            <div className="form-group">
              <label className="form-label">Player Name</label>
              <input className="form-input" value={form.childName} onChange={e => setForm(f => ({ ...f, childName: e.target.value }))} placeholder="First name" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Jersey #</label>
                <input className="form-input" type="number" value={form.jerseyNumber} onChange={e => setForm(f => ({ ...f, jerseyNumber: e.target.value }))} placeholder="00" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Position</label>
                <select className="form-select" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}>
                  <option value="">Select...</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Parent Name</label>
              <input className="form-input" value={form.parentName} onChange={e => setForm(f => ({ ...f, parentName: e.target.value }))} placeholder="Parent's name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" />
            </div>
            <button className="btn-primary" onClick={addPlayer}>Add Player</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
