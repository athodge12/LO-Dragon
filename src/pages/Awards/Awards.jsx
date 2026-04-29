import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const AWARD_TYPES = [
  { key: 'play_of_game',  emoji: '⭐', label: 'Play of the Game' },
  { key: 'great_hit',     emoji: '🎯', label: 'Great Hit' },
  { key: 'great_catch',   emoji: '🧤', label: 'Great Catch' },
  { key: 'great_play',    emoji: '🏃', label: 'Great Play' },
  { key: 'most_improved', emoji: '💪', label: 'Most Improved' },
  { key: 'good_attitude', emoji: '💛', label: 'Good Attitude' },
  { key: 'team_player',   emoji: '🤝', label: 'Team Player' },
  { key: 'clutch',        emoji: '🔥', label: 'Clutch Moment' },
];

export default function Awards() {
  const { isCoach, userProfile } = useAuth();
  const [awards, setAwards] = useState([]);
  const [players, setPlayers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ playerId: '', awardKey: '', note: '', opponent: '', date: '' });
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    const awardQ = query(collection(db, 'awards'), orderBy('createdAt', 'desc'));
    unsubs.push(onSnapshot(awardQ, snap => {
      setAwards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'roster'), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().childName || '' }))
        .filter(p => p.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submitAward = async () => {
    if (!form.playerId || !form.awardKey) return;
    const player = players.find(p => p.id === form.playerId);
    const award = AWARD_TYPES.find(a => a.key === form.awardKey);
    await addDoc(collection(db, 'awards'), {
      playerId: form.playerId,
      playerName: player?.name || '',
      awardKey: form.awardKey,
      awardEmoji: award?.emoji || '⭐',
      awardLabel: award?.label || '',
      note: form.note.trim(),
      opponent: form.opponent.trim(),
      date: form.date,
      grantedBy: `${userProfile?.firstName} ${userProfile?.lastName}`.trim(),
      createdAt: new Date().toISOString()
    });
    setForm({ playerId: '', awardKey: '', note: '', opponent: '', date: '' });
    setShowModal(false);
    setToast('Award given!');
  };

  const deleteAward = async (id) => {
    if (!window.confirm('Remove this award?')) return;
    await deleteDoc(doc(db, 'awards', id));
    setToast('Award removed');
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group by player for summary
  const playerCounts = {};
  awards.forEach(a => {
    if (!playerCounts[a.playerId]) playerCounts[a.playerId] = { name: a.playerName, count: 0 };
    playerCounts[a.playerId].count++;
  });
  const topPlayers = Object.values(playerCounts).sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Awards" back="/" actions={isCoach && (
        <button onClick={() => setShowModal(true)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', fontSize: '20px'
        }}>+</button>
      )} />

      <div className="page-content">
        {/* Top players summary */}
        {topPlayers.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '14px', padding: '16px', marginBottom: '14px', color: 'white'
          }}>
            <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '12px' }}>
              Season Highlights
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {topPlayers.map((p, i) => (
                <div key={p.name} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: i === 0 ? '28px' : '22px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', marginTop: '4px' }}>{p.name}</div>
                  <div style={{ fontSize: '11px', opacity: 0.75 }}>{p.count} award{p.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Awards feed */}
        {awards.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: '32px' }}>⭐</p>
            <p>No awards yet. {isCoach ? 'Give one after the next game!' : 'Check back after a game.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {awards.map(award => (
              <div key={award.id} style={{
                background: 'white', border: '1px solid var(--gray-200)',
                borderRadius: '12px', padding: '14px',
                display: 'flex', gap: '12px', alignItems: 'flex-start'
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '12px',
                  background: '#FFF5F5', border: '1px solid #FECACA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', flexShrink: 0
                }}>{award.awardEmoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '16px' }}>{award.playerName}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: '700', padding: '2px 8px',
                      borderRadius: '10px', background: '#FEE2E2', color: 'var(--red)',
                      textTransform: 'uppercase', letterSpacing: '0.3px'
                    }}>{award.awardLabel}</span>
                  </div>
                  {award.note && (
                    <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginTop: '4px', lineHeight: '1.4' }}>
                      "{award.note}"
                    </p>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>
                    {award.opponent && `vs ${award.opponent}`}{award.opponent && award.date && ' · '}{formatDate(award.date)}
                    {award.grantedBy && ` · by ${award.grantedBy}`}
                  </div>
                </div>
                {isCoach && (
                  <button onClick={() => deleteAward(award.id)} style={{
                    background: 'none', border: 'none', color: 'var(--gray-300)',
                    cursor: 'pointer', fontSize: '18px', padding: 0, flexShrink: 0
                  }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Award Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Give an Award
            </h3>
            <div className="form-group">
              <label className="form-label">Player</label>
              <select className="form-select" value={form.playerId} onChange={e => set('playerId', e.target.value)}>
                <option value="">— Select player —</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Award</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {AWARD_TYPES.map(a => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => set('awardKey', a.key)}
                    style={{
                      padding: '10px 8px', borderRadius: '10px', cursor: 'pointer',
                      border: `2px solid ${form.awardKey === a.key ? 'var(--red)' : 'var(--gray-200)'}`,
                      background: form.awardKey === a.key ? '#FEF2F2' : 'white',
                      textAlign: 'center', fontSize: '13px', fontWeight: '600',
                      color: form.awardKey === a.key ? 'var(--red)' : 'var(--gray-600)'
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '2px' }}>{a.emoji}</div>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder='e.g. "Incredible diving catch in the 4th"' />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">vs Opponent</label>
                <input className="form-input" value={form.opponent} onChange={e => set('opponent', e.target.value)} placeholder="Team name" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={submitAward}
              disabled={!form.playerId || !form.awardKey}
              style={{ marginTop: '16px' }}
            >
              Give Award ⭐
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
