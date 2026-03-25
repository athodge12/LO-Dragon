import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Dues() {
  const { isCoach, currentUser, userProfile } = useAuth();
  const [players, setPlayers] = useState([]);
  const [duesConfig, setDuesConfig] = useState({ amount: 0, description: '' });
  const [payments, setPayments] = useState({});
  const [editConfig, setEditConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ amount: '', description: '' });
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    const usersQ = query(collection(db, 'users'), orderBy('createdAt'));
    unsubs.push(onSnapshot(usersQ, snap => {
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(members.filter(m => m.role === 'parent' || m.role === 'player'));
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'duesConfig'), snap => {
      if (snap.exists()) {
        setDuesConfig(snap.data());
        setConfigForm(snap.data());
      }
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'payments'), snap => {
      if (snap.exists()) setPayments(snap.data());
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const saveDuesConfig = async () => {
    await setDoc(doc(db, 'settings', 'duesConfig'), {
      amount: parseFloat(configForm.amount) || 0,
      description: configForm.description
    });
    setEditConfig(false);
    setToast('Dues settings saved!');
  };

  const togglePaid = async (playerId) => {
    if (!isCoach) return;
    const newPayments = { ...payments, [playerId]: !payments[playerId] };
    await setDoc(doc(db, 'settings', 'payments'), newPayments);
    setToast(newPayments[playerId] ? '✅ Marked as paid' : 'Marked as unpaid');
  };

  const getPlayerName = (p) => p.childName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown';

  const paidCount = players.filter(p => payments[p.id]).length;
  const totalOwed = players.length * (duesConfig.amount || 0);
  const totalCollected = paidCount * (duesConfig.amount || 0);

  // My payment status (for parents)
  const myPlayer = players.find(p => p.id === currentUser?.uid);
  const myStatus = myPlayer ? payments[myPlayer.id] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Dues Tracker" back="/" actions={isCoach && (
        <button onClick={() => setEditConfig(!editConfig)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', fontSize: '16px'
        }}>⚙️</button>
      )} />

      <div className="page-content">
        {/* My Status (for parents) */}
        {!isCoach && myPlayer && (
          <div style={{
            background: myStatus ? '#DCFCE7' : '#FEE2E2',
            border: `1px solid ${myStatus ? '#86EFAC' : '#FECACA'}`,
            borderRadius: '12px', padding: '16px', marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <span style={{ fontSize: '28px' }}>{myStatus ? '✅' : '💰'}</span>
            <div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: myStatus ? '#16A34A' : '#B91C1C' }}>
                {myStatus ? 'Dues Paid!' : 'Dues Outstanding'}
              </div>
              <div style={{ fontSize: '13px', color: myStatus ? '#16A34A' : '#B91C1C', opacity: 0.8 }}>
                {duesConfig.description || 'Season dues'} — ${duesConfig.amount || 0}
              </div>
            </div>
          </div>
        )}

        {/* Config Editor */}
        {editConfig && isCoach && (
          <div className="card" style={{ marginBottom: '14px' }}>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase' }}>
              Dues Settings
            </h3>
            <div className="form-group">
              <label className="form-label">Amount ($)</label>
              <input className="form-input" type="number" value={configForm.amount} onChange={e => setConfigForm(f => ({ ...f, amount: e.target.value }))} placeholder="150.00" min="0" step="0.01" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={configForm.description} onChange={e => setConfigForm(f => ({ ...f, description: e.target.value }))} placeholder="2025 Season Registration" />
            </div>
            <button className="btn-primary" onClick={saveDuesConfig}>Save Settings</button>
          </div>
        )}

        {/* Summary */}
        {isCoach && (
          <div style={{
            background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
            borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white'
          }}>
            <p style={{ fontSize: '11px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
              {duesConfig.description || 'Season Dues'} — ${duesConfig.amount} per player
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '28px', fontWeight: '700' }}>{paidCount}</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>PAID</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '28px', fontWeight: '700' }}>{players.length - paidCount}</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>UNPAID</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '28px', fontWeight: '700' }}>
                  ${totalCollected}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>COLLECTED</div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '4px', height: '6px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{
                background: 'white', height: '100%', borderRadius: '4px',
                width: players.length > 0 ? `${(paidCount / players.length) * 100}%` : '0%',
                transition: 'width 0.3s'
              }} />
            </div>
            <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
              ${totalCollected} / ${totalOwed}
            </div>
          </div>
        )}

        {/* Player List */}
        {players.length === 0 ? (
          <div className="empty-state">
            <p>No players on roster yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map(player => {
              const paid = payments[player.id];
              return (
                <div key={player.id} style={{
                  background: 'white', border: `1px solid ${paid ? '#86EFAC' : 'var(--gray-200)'}`,
                  borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: paid ? '#DCFCE7' : '#FEE2E2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', flexShrink: 0
                  }}>{paid ? '✅' : '💰'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px' }}>{getPlayerName(player)}</div>
                    <div style={{ fontSize: '12px', color: paid ? '#16A34A' : 'var(--red)', fontWeight: '600', marginTop: '2px' }}>
                      {paid ? 'Paid' : `$${duesConfig.amount || 0} due`}
                    </div>
                  </div>
                  {isCoach && (
                    <button
                      onClick={() => togglePaid(player.id)}
                      style={{
                        padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                        border: `1.5px solid ${paid ? '#16A34A' : 'var(--gray-200)'}`,
                        background: paid ? '#DCFCE7' : 'var(--gray-50)',
                        color: paid ? '#16A34A' : 'var(--gray-600)',
                        fontWeight: '600', fontSize: '13px', flexShrink: 0
                      }}
                    >{paid ? 'Paid ✓' : 'Mark Paid'}</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
