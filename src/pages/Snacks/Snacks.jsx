import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Snacks() {
  const { isCoach, isAdmin, currentUser, userProfile } = useAuth();
  const [games, setGames] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [parents, setParents] = useState([]);
  const [modal, setModal] = useState(null); // game object (coach assign modal)
  const [confirmGame, setConfirmGame] = useState(null); // game for parent sign-up confirm
  const [selectedFamily, setSelectedFamily] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // game to delete

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
      setParents(all.filter(u => u.role === 'parent' || u.roles?.includes('parent')));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  // Coach: open assign modal
  const openAssign = (game) => {
    if (!isCoach) return;
    const existing = assignments[game.id];
    setSelectedFamily(existing?.familyId || '');
    setNote(existing?.note || '');
    setModal(game);
  };

  // Coach: save assignment
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
    setToast('Drinks assignment saved!');
    setModal(null);
  };

  // Coach: clear assignment
  const clearAssignment = async () => {
    if (!modal) return;
    await deleteDoc(doc(db, 'snacks', modal.id));
    setToast('Assignment cleared');
    setModal(null);
  };

  // Parent: sign themselves up
  const signUpSelf = async (game) => {
    const myName = userProfile?.childName
      ? `${userProfile.childName}'s Family`
      : `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'My Family';
    await setDoc(doc(db, 'snacks', game.id), {
      gameId: game.id,
      gameDate: game.date,
      opponent: game.opponent,
      familyId: currentUser.uid,
      familyName: myName,
      note: ''
    });
    setToast('You\'re signed up for drinks!');
    setConfirmGame(null);
  };

  // Coach: delete past game (and its snack assignment)
  const handleDeleteGame = async (game) => {
    await deleteDoc(doc(db, 'games', game.id));
    if (assignments[game.id]) {
      await deleteDoc(doc(db, 'snacks', game.id));
    }
    setToast('Game deleted');
    setDeleteConfirm(null);
  };

  // Parent: remove themselves
  const removeSelf = async (gameId) => {
    await deleteDoc(doc(db, 'snacks', gameId));
    setToast('Removed from drinks schedule');
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = games.filter(g => !g.result && g.date >= today);
  const past = games.filter(g => g.date && (g.result || g.date < today)).slice(-5).reverse();

  const myId = currentUser?.uid;
  const myAssignments = Object.values(assignments).filter(a => a.familyId === myId);

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });

  const GameRow = ({ game, onDelete }) => {
    const assigned = assignments[game.id];
    const isMe = assigned?.familyId === myId;
    const isOpen = !assigned?.familyId;

    const handleTap = () => {
      if (isCoach) { openAssign(game); return; }
      if (isMe) { removeSelf(game.id); return; }
      if (isOpen) { setConfirmGame(game); }
    };

    return (
      <div style={{
        background: isMe ? '#FFF5F5' : 'white',
        border: `1px solid ${isMe ? '#FECACA' : 'var(--gray-200)'}`,
        borderRadius: '10px', padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
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
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>{formatDate(game.date)}</div>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {onDelete && isAdmin && (
            <button onClick={() => onDelete(game)} style={{
              fontSize: '11px', color: '#ef4444', background: 'none',
              border: '1px solid #fecaca', borderRadius: '6px',
              padding: '2px 8px', cursor: 'pointer', marginBottom: '2px'
            }}>Delete</button>
          )}
          {assigned?.familyId ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: '700', color: isMe ? 'var(--red)' : 'var(--gray-700)' }}>
                {isMe ? 'You! 🥤' : assigned.familyName}
              </div>
              {assigned.note && (
                <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{assigned.note}</div>
              )}
              {isMe && (
                <button onClick={handleTap} style={{
                  fontSize: '11px', color: 'var(--gray-400)', background: 'none',
                  border: '1px solid var(--gray-200)', borderRadius: '6px',
                  padding: '2px 8px', cursor: 'pointer'
                }}>Remove me</button>
              )}
              {isCoach && (
                <button onClick={handleTap} style={{
                  fontSize: '11px', color: 'var(--gray-500)', background: 'none',
                  border: '1px solid var(--gray-200)', borderRadius: '6px',
                  padding: '2px 8px', cursor: 'pointer'
                }}>Edit</button>
              )}
            </>
          ) : (
            <>
              {isCoach ? (
                <button onClick={handleTap} style={{
                  fontSize: '12px', color: 'var(--gray-500)', background: 'none',
                  border: '1px solid var(--gray-200)', borderRadius: '6px',
                  padding: '4px 10px', cursor: 'pointer'
                }}>Assign</button>
              ) : (
                <button onClick={handleTap} style={{
                  fontSize: '12px', fontWeight: '700', color: 'white',
                  background: 'var(--red)', border: 'none', borderRadius: '8px',
                  padding: '6px 12px', cursor: 'pointer'
                }}>Sign Up</button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Team Drinks Sign Up" back="/" />

      <div className="page-content">
        {/* My assignment banner */}
        {!isCoach && myAssignments.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '12px', padding: '14px 16px', marginBottom: '14px',
            color: 'white', display: 'flex', gap: '12px', alignItems: 'center'
          }}>
            <span style={{ fontSize: '28px' }}>🥤</span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase' }}>
                Your Drinks Day{myAssignments.length > 1 ? 's' : ''}
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
              {past.map(g => <GameRow key={g.id} game={g} onDelete={isAdmin ? setDeleteConfirm : null} />)}
            </div>
          </div>
        )}
      </div>

      {/* Coach assign modal */}
      {modal && isCoach && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Assign Drinks
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              vs {modal.opponent} · {formatDate(modal.date)}
            </p>
            <div className="form-group">
              <label className="form-label">Family</label>
              <select className="form-select" value={selectedFamily} onChange={e => setSelectedFamily(e.target.value)}>
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

      {/* Parent sign-up confirm modal */}
      {confirmGame && (
        <div className="modal-overlay" onClick={() => setConfirmGame(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🥤</div>
              <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', marginBottom: '6px', textTransform: 'uppercase' }}>
                Sign Up for Drinks?
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--gray-500)', lineHeight: '1.5', marginBottom: '4px' }}>
                vs {confirmGame.opponent}
              </p>
              <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '20px' }}>
                {formatDate(confirmGame.date)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: '1.6', marginBottom: '20px' }}>
                You'll be responsible for heading to concessions and purchasing team drinks at the ballpark for this game. You can remove yourself any time before the game.
              </p>
            </div>
            <button className="btn-primary" onClick={() => signUpSelf(confirmGame)}>
              Yes, I'll Bring Drinks!
            </button>
            <button className="btn-secondary" onClick={() => setConfirmGame(null)} style={{ marginTop: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete game confirm modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Delete Game?
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '20px' }}>
              vs {deleteConfirm.opponent} · {formatDate(deleteConfirm.date)}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '20px' }}>
              This will permanently remove this game and its drinks assignment from the schedule.
            </p>
            <button
              onClick={() => handleDeleteGame(deleteConfirm)}
              style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
                background: '#ef4444', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer'
              }}
            >
              Yes, Delete Game
            </button>
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)} style={{ marginTop: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
