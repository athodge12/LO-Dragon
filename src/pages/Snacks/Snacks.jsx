import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Snacks() {
  const { isCoach, currentUser, userProfile } = useAuth();
  const [games, setGames] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [parents, setParents] = useState([]);
  const [modal, setModal] = useState(null); // game object
  const [selectedFamily, setSelectedFamily] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    const gamesQ = query(collection(db, 'games'), orderBy('date'));
    unsubs.push(onSnapshot(gamesQ, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'snacks'), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setAssignments(map);
    }));
    unsubs.push(onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setParents(all.filter(u => u.role === 'parent'));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const openAssign = (game) => {
    if (!isCoach) return;
    const existing = assignments[game.id];
    setSelectedFamily(existing?.familyId || '');
    setNote(existing?.note || '');
    setModal(game);
  };

  const saveAssignment = async () => {
    if (!modal) return;
    const parent = parents.find(p => p.id === selectedFamily);
    const familyName = parent
      ? (parent.childName ? `${parent.childName}'s Family` : `${parent.firstName} ${parent.lastName}`)
      : '';
    await setDoc(doc(db, 'snacks', modal.id), {
      gameId: modal.id,
      gameDate: modal.date,
      opponent: modal.opponent,
      familyId: selectedFamily,
      familyName,
      note: note.trim()
    });
    setToast('Snack assignment saved!');
    setModal(null);
  };

  const clearAssignment = async () => {
    if (!modal) return;
    await deleteDoc(doc(db, 'snacks', modal.id));
    setToast('Assignment cleared');
    setModal(null);
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = games.filter(g => !g.result && g.date >= today);
  const past = games.filter(g => g.result || g.date < today).slice(-5).reverse();

  const myId = currentUser?.uid;
  const myAssignments = Object.values(assignments).filter(a => a.familyId === myId);

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });

  const GameRow = ({ game }) => {
    const assigned = assignments[game.id];
    const isMe = assigned?.familyId === myId;
    return (
      <div
        onClick={() => openAssign(game)}
        style={{
          background: isMe ? '#FFF5F5' : 'white',
          border: `1px solid ${isMe ? '#FECACA' : 'var(--gray-200)'}`,
          borderRadius: '10px', padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: '12px',
          cursor: isCoach ? 'pointer' : 'default'
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '10px',
          background: 'var(--red)', color: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', opacity: 0.8 }}>
            {new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
            {new Date(game.date + 'T12:00:00').getDate()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>vs {game.opponent}</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
            {formatDate(game.date)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {assigned?.familyId ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: isMe ? 'var(--red)' : 'var(--gray-700)' }}>
                {isMe ? 'You! 🍊' : assigned.familyName}
              </div>
              {assigned.note && (
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>{assigned.note}</div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
              {isCoach ? 'Tap to assign' : 'Unassigned'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Snack Schedule" back="/" />

      <div className="page-content">
        {/* My assignment banner */}
        {!isCoach && myAssignments.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '12px', padding: '14px 16px', marginBottom: '14px',
            color: 'white', display: 'flex', gap: '12px', alignItems: 'center'
          }}>
            <span style={{ fontSize: '28px' }}>🍊</span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase' }}>
                Your Snack Day{myAssignments.length > 1 ? 's' : ''}
              </div>
              {myAssignments.map(a => (
                <div key={a.gameId} style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px' }}>
                  vs {a.opponent} — {formatDate(a.gameDate)}
                  {a.note && ` · ${a.note}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            Upcoming Games
          </p>
          {upcoming.length === 0 ? (
            <div className="empty-state"><p>No upcoming games</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcoming.map(g => <GameRow key={g.id} game={g} />)}
            </div>
          )}
        </div>

        {/* Past */}
        {past.length > 0 && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Recent Games
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {past.map(g => <GameRow key={g.id} game={g} />)}
            </div>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {modal && isCoach && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Assign Snacks
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              vs {modal.opponent} · {formatDate(modal.date)}
            </p>
            <div className="form-group">
              <label className="form-label">Family</label>
              <select
                className="form-select"
                value={selectedFamily}
                onChange={e => setSelectedFamily(e.target.value)}
              >
                <option value="">— Select a family —</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.childName ? `${p.childName}'s Family` : `${p.firstName} ${p.lastName}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input
                className="form-input"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Bring juice boxes too"
              />
            </div>
            <button className="btn-primary" onClick={saveAssignment} disabled={!selectedFamily}>
              Save Assignment
            </button>
            {assignments[modal.id]?.familyId && (
              <button className="btn-secondary" onClick={clearAssignment} style={{ marginTop: '8px' }}>
                Clear Assignment
              </button>
            )}
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
