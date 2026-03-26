import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const INNINGS = [1, 2, 3, 4, 5, 6, 7];

export default function LiveScoring() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [scoreData, setScoreData] = useState({
    opponent: '',
    dragons: [0, 0, 0, 0, 0, 0, 0],
    them: [0, 0, 0, 0, 0, 0, 0]
  });
  const [opponent, setOpponent] = useState('');
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'liveScore'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setScoreData(data);
        setOpponent(data.opponent || '');
      }
    });
  }, []);

  const updateScore = async (team, inning, delta) => {
    if (!canEdit) return;
    const newData = { ...scoreData };
    const current = newData[team][inning - 1] || 0;
    newData[team][inning - 1] = Math.max(0, current + delta);
    await setDoc(doc(db, 'settings', 'liveScore'), newData);
  };

  const resetScore = async () => {
    if (!window.confirm('Reset the scoreboard?')) return;
    const newData = {
      opponent: scoreData.opponent,
      dragons: [0, 0, 0, 0, 0, 0, 0],
      them: [0, 0, 0, 0, 0, 0, 0]
    };
    await setDoc(doc(db, 'settings', 'liveScore'), newData);
    setToast('Scoreboard reset!');
  };

  const saveOpponent = async () => {
    await setDoc(doc(db, 'settings', 'liveScore'), { ...scoreData, opponent }, { merge: true });
    setToast('Opponent set!');
  };

  const total = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);
  const dragonsTotal = total(scoreData.dragons);
  const themTotal = total(scoreData.them);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Live Scoring" back="/" />

      <div className="page-content">
        {!canEdit && <div className="view-only-banner">Live score updated by coaches</div>}

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <input
              className="form-input"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="Opponent name..."
              style={{ flex: 1 }}
            />
            <button onClick={saveOpponent} style={{
              background: 'var(--red)', color: 'white', border: 'none',
              borderRadius: '8px', padding: '0 14px', cursor: 'pointer', fontWeight: '600', flexShrink: 0
            }}>Set</button>
          </div>
        )}

        {/* Big scoreboard */}
        <div style={{
          background: '#111', borderRadius: '16px', padding: '20px',
          marginBottom: '14px', fontFamily: 'Oswald, sans-serif'
        }}>
          {/* Team names & total */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--red)', fontSize: '18px', fontWeight: '700', textTransform: 'uppercase' }}>
                Dragons
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <div style={{
                fontSize: '56px', fontWeight: '700',
                color: dragonsTotal >= themTotal ? '#FFD700' : 'white',
                lineHeight: 1, minWidth: '50px', textAlign: 'center'
              }}>{dragonsTotal}</div>
              <div style={{ color: 'var(--gray-400)', fontSize: '24px' }}>–</div>
              <div style={{
                fontSize: '56px', fontWeight: '700',
                color: themTotal > dragonsTotal ? '#FFD700' : 'white',
                lineHeight: 1, minWidth: '50px', textAlign: 'center'
              }}>{themTotal}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ color: 'var(--gray-400)', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase' }}>
                {scoreData.opponent || 'Opponent'}
              </div>
            </div>
          </div>

          {/* Inning by inning */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '320px' }}>
              <thead>
                <tr>
                  <td style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 8px', textAlign: 'left' }}>Team</td>
                  {INNINGS.map(i => (
                    <td key={i} style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 6px', textAlign: 'center' }}>{i}</td>
                  ))}
                  <td style={{ color: 'var(--gray-500)', fontSize: '12px', padding: '4px 8px', textAlign: 'center', fontWeight: '700' }}>R</td>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'DRG', key: 'dragons', color: 'var(--red)' },
                  { label: scoreData.opponent?.substring(0, 4)?.toUpperCase() || 'OPP', key: 'them', color: 'var(--gray-400)' }
                ].map(team => (
                  <tr key={team.key}>
                    <td style={{ color: team.color, fontSize: '14px', fontWeight: '700', padding: '6px 8px' }}>{team.label}</td>
                    {INNINGS.map(i => (
                      <td key={i} style={{ textAlign: 'center', padding: '6px 2px' }}>
                        {canEdit ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <button onClick={() => updateScore(team.key, i, 1)} style={{
                              background: 'var(--gray-700)', border: 'none', borderRadius: '3px',
                              color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1
                            }}>+</button>
                            <span style={{ color: 'white', fontSize: '16px', fontWeight: '700', lineHeight: 1 }}>
                              {scoreData[team.key]?.[i - 1] || 0}
                            </span>
                            <button onClick={() => updateScore(team.key, i, -1)} style={{
                              background: 'var(--gray-700)', border: 'none', borderRadius: '3px',
                              color: 'white', width: 24, height: 18, cursor: 'pointer', fontSize: '12px', lineHeight: 1
                            }}>–</button>
                          </div>
                        ) : (
                          <span style={{ color: 'white', fontSize: '16px', fontWeight: '700' }}>
                            {scoreData[team.key]?.[i - 1] || 0}
                          </span>
                        )}
                      </td>
                    ))}
                    <td style={{
                      textAlign: 'center', padding: '6px 8px',
                      color: 'white', fontSize: '18px', fontWeight: '700',
                      borderLeft: '1px solid var(--gray-700)'
                    }}>
                      {total(scoreData[team.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Game status */}
        <div className="card" style={{ textAlign: 'center', marginBottom: '14px' }}>
          {dragonsTotal > themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--green)', fontWeight: '700' }}>
              🏆 Dragons Lead {dragonsTotal}–{themTotal}
            </p>
          ) : dragonsTotal < themTotal ? (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--red)', fontWeight: '700' }}>
              Trailing {dragonsTotal}–{themTotal}
            </p>
          ) : (
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--gray-500)', fontWeight: '700' }}>
              🤝 Tied {dragonsTotal}–{themTotal}
            </p>
          )}
        </div>

        {canEdit && (
          <button className="btn-secondary" onClick={resetScore} style={{ width: '100%' }}>
            🔄 Reset Scoreboard
          </button>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
