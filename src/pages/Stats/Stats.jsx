import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Stats() {
  const { isCoach } = useAuth();
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editStats, setEditStats] = useState({});
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('batting');

  useEffect(() => {
    const usersQ = query(collection(db, 'users'), orderBy('createdAt'));
    const unsub1 = onSnapshot(usersQ, snap => {
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const playerList = members.filter(m => m.role === 'parent' || m.role === 'player');
      setPlayers(playerList);
    });

    const statsQ = query(collection(db, 'playerStats'));
    const unsub2 = onSnapshot(statsQ, snap => {
      const stats = {};
      snap.docs.forEach(d => { stats[d.id] = d.data(); });
      setAllStats(stats);
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const getPlayerName = (p) => p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';

  const getCareer = (playerId) => allStats[playerId]?.career || {};

  const startEdit = (player) => {
    setEditingPlayer(player.id);
    const career = getCareer(player.id);
    setEditStats({
      ab: career.ab || 0,
      hits: career.hits || 0,
      hr: career.hr || 0,
      rbi: career.rbi || 0,
      runs: career.runs || 0,
      sb: career.sb || 0,
      ip: career.ip || 0,
      er: career.er || 0
    });
  };

  const saveStats = async (playerId) => {
    const ab = parseInt(editStats.ab) || 0;
    const hits = parseInt(editStats.hits) || 0;
    const ip = parseFloat(editStats.ip) || 0;
    const er = parseInt(editStats.er) || 0;
    const avg = ab > 0 ? hits / ab : 0;
    const era = ip > 0 ? (er * 7) / ip : 0;

    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(ref, {
      ...current,
      career: {
        ...editStats,
        ab, hits, hr: parseInt(editStats.hr) || 0,
        rbi: parseInt(editStats.rbi) || 0,
        runs: parseInt(editStats.runs) || 0,
        sb: parseInt(editStats.sb) || 0,
        ip, er, avg, era
      }
    }, { merge: true });
    setEditingPlayer(null);
    setToast('Stats saved!');
  };

  const formatAvg = (career) => {
    if (!career.ab) return '.000';
    const avg = career.avg || (career.hits / career.ab);
    return '.' + String(Math.round(avg * 1000)).padStart(3, '0');
  };

  // Team totals
  const teamStats = players.reduce((acc, p) => {
    const c = getCareer(p.id);
    return {
      ab: (acc.ab || 0) + (c.ab || 0),
      hits: (acc.hits || 0) + (c.hits || 0),
      hr: (acc.hr || 0) + (c.hr || 0),
      rbi: (acc.rbi || 0) + (c.rbi || 0),
      runs: (acc.runs || 0) + (c.runs || 0)
    };
  }, {});
  const teamAvg = teamStats.ab > 0 ? teamStats.hits / teamStats.ab : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Stats" />

      <div className="page-content">
        {!isCoach && <div className="view-only-banner">👁 Stats are updated by coaches</div>}

        {/* Team Stats Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
          borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white'
        }}>
          <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '8px' }}>
            Team Stats — 2025 Season
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'AVG', value: '.' + String(Math.round(teamAvg * 1000)).padStart(3, '0') },
              { label: 'R', value: teamStats.runs || 0 },
              { label: 'HR', value: teamStats.hr || 0 },
              { label: 'RBI', value: teamStats.rbi || 0 }
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700' }}>{s.value}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'batting' ? 'active' : ''}`} onClick={() => setTab('batting')}>Batting</button>
          <button className={`tab ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>Pitching</button>
        </div>

        {/* Stats Table */}
        {tab === 'batting' && (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>AVG</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>AB</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>H</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>HR</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>RBI</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>R</th>
                    {isCoach && <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)' }}>Edit</th>}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, i) => {
                    const career = getCareer(player.id);
                    return (
                      <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>{getPlayerName(player)}</div>
                          {player.jerseyNumber && <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>#{player.jerseyNumber}</div>}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700' }}>{formatAvg(career)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.ab || 0}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.hits || 0}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.hr || 0}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.rbi || 0}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.runs || 0}</td>
                        {isCoach && (
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <button onClick={() => startEdit(player)} style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: '16px', color: 'var(--red)'
                            }}>✏️</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'pitching' && (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '300px' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>ERA</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>IP</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>ER</th>
                  </tr>
                </thead>
                <tbody>
                  {players.filter(p => getCareer(p.id).ip > 0).map((player, i) => {
                    const career = getCareer(player.id);
                    return (
                      <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>{getPlayerName(player)}</div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700' }}>
                          {career.era ? career.era.toFixed(2) : '--'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.ip || 0}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{career.er || 0}</td>
                      </tr>
                    );
                  })}
                  {players.filter(p => getCareer(p.id).ip > 0).length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '14px' }}>
                        No pitching stats yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AI Placeholder */}
        <div className="card" style={{
          background: 'linear-gradient(135deg, #1e1e2e, #2d1b4e)', border: 'none', marginTop: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', color: 'white', textTransform: 'uppercase' }}>
              AI Lineup Recommendations
            </span>
            <span style={{ background: '#7C3AED', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>SOON</span>
          </div>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
            Claude AI will analyze stats to recommend optimal batting order and lineup based on matchups.
          </p>
        </div>
      </div>

      {/* Edit Stats Modal */}
      {editingPlayer && (
        <div className="modal-overlay" onClick={() => setEditingPlayer(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Edit Stats
            </h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '16px' }}>
              {getPlayerName(players.find(p => p.id === editingPlayer))}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { key: 'ab', label: 'At Bats' },
                { key: 'hits', label: 'Hits' },
                { key: 'hr', label: 'Home Runs' },
                { key: 'rbi', label: 'RBI' },
                { key: 'runs', label: 'Runs' },
                { key: 'sb', label: 'Stolen Bases' },
                { key: 'ip', label: 'Innings Pitched' },
                { key: 'er', label: 'Earned Runs' }
              ].map(field => (
                <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{field.label}</label>
                  <input
                    className="form-input"
                    type="number"
                    value={editStats[field.key]}
                    onChange={e => setEditStats(s => ({ ...s, [field.key]: e.target.value }))}
                    min="0" step={field.key === 'ip' ? '0.1' : '1'}
                    style={{ textAlign: 'center' }}
                  />
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => saveStats(editingPlayer)} style={{ marginTop: '16px' }}>
              Save Stats
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
