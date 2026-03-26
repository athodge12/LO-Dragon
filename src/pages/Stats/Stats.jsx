import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

export default function Stats() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [season, setSeason] = useState(null); // current season config
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editStats, setEditStats] = useState({});
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('current');
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState('');

  useEffect(() => {
    const unsubs = [];

    const usersQ = query(collection(db, 'users'), orderBy('createdAt'));
    unsubs.push(onSnapshot(usersQ, snap => {
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(members.filter(m => m.role === 'parent' || m.role === 'player'));
    }));

    unsubs.push(onSnapshot(collection(db, 'playerStats'), snap => {
      const stats = {};
      snap.docs.forEach(d => { stats[d.id] = d.data(); });
      setAllStats(stats);
    }));

    unsubs.push(onSnapshot(doc(db, 'settings', 'season'), snap => {
      if (snap.exists()) setSeason(snap.data());
      else setSeason({ year: '2026' });
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  const currentYear = season?.year || '2026';

  const getPlayerName = (p) => p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';

  // Current season stats stored under playerStats/{id}/seasons/{year}
  const getCurrentSeason = (playerId) => allStats[playerId]?.seasons?.[currentYear] || {};
  // All-time career totals
  const getCareer = (playerId) => allStats[playerId]?.career || {};
  // Archived seasons list
  const getSeasonHistory = (playerId) => allStats[playerId]?.seasons || {};

  const startEdit = (player) => {
    setEditingPlayer(player.id);
    const s = getCurrentSeason(player.id);
    setEditStats({
      ab: s.ab || 0, hits: s.hits || 0, hr: s.hr || 0,
      rbi: s.rbi || 0, runs: s.runs || 0, sb: s.sb || 0,
      ip: s.ip || 0, er: s.er || 0
    });
  };

  const saveStats = async (playerId) => {
    const ab = parseInt(editStats.ab) || 0;
    const hits = parseInt(editStats.hits) || 0;
    const ip = parseFloat(editStats.ip) || 0;
    const er = parseInt(editStats.er) || 0;
    const avg = ab > 0 ? hits / ab : 0;
    const era = ip > 0 ? (er * 7) / ip : 0;

    const newSeasonStats = {
      ab, hits, hr: parseInt(editStats.hr) || 0,
      rbi: parseInt(editStats.rbi) || 0,
      runs: parseInt(editStats.runs) || 0,
      sb: parseInt(editStats.sb) || 0,
      ip, er, avg, era
    };

    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    const allSeasons = current.seasons || {};

    // Recalculate career totals across all seasons
    const updatedSeasons = { ...allSeasons, [currentYear]: newSeasonStats };
    const career = Object.values(updatedSeasons).reduce((acc, s) => ({
      ab: (acc.ab || 0) + (s.ab || 0),
      hits: (acc.hits || 0) + (s.hits || 0),
      hr: (acc.hr || 0) + (s.hr || 0),
      rbi: (acc.rbi || 0) + (s.rbi || 0),
      runs: (acc.runs || 0) + (s.runs || 0),
      sb: (acc.sb || 0) + (s.sb || 0),
      ip: (acc.ip || 0) + (s.ip || 0),
      er: (acc.er || 0) + (s.er || 0),
    }), {});
    career.avg = career.ab > 0 ? career.hits / career.ab : 0;
    career.era = career.ip > 0 ? (career.er * 7) / career.ip : 0;

    await setDoc(ref, { ...current, seasons: updatedSeasons, career }, { merge: true });
    setEditingPlayer(null);
    setToast('Stats saved!');
  };

  const startNewSeason = async () => {
    if (!newSeasonYear.trim()) return;
    await setDoc(doc(db, 'settings', 'season'), { year: newSeasonYear.trim() });
    setShowNewSeasonModal(false);
    setNewSeasonYear('');
    setToast(`🎉 ${newSeasonYear} season started!`);
  };

  const formatAvg = (s) => {
    if (!s.ab) return '.000';
    const avg = s.avg !== undefined ? s.avg : s.hits / s.ab;
    return '.' + String(Math.round(avg * 1000)).padStart(3, '0');
  };

  const calcTeamTotals = (getStatsFn) => players.reduce((acc, p) => {
    const s = getStatsFn(p.id);
    return {
      ab: (acc.ab || 0) + (s.ab || 0),
      hits: (acc.hits || 0) + (s.hits || 0),
      hr: (acc.hr || 0) + (s.hr || 0),
      rbi: (acc.rbi || 0) + (s.rbi || 0),
      runs: (acc.runs || 0) + (s.runs || 0),
    };
  }, {});

  const currentTeam = calcTeamTotals(getCurrentSeason);
  const careerTeam = calcTeamTotals(getCareer);
  const activeTeam = tab === 'career' ? careerTeam : currentTeam;
  const teamAvg = activeTeam.ab > 0 ? activeTeam.hits / activeTeam.ab : 0;

  const StatsTable = ({ getStats, showEdit }) => (
    <div>
      <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                {['AVG','AB','H','HR','RBI','R'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{h}</th>
                ))}
                {showEdit && canEdit && <th style={{ padding: '10px 8px' }} />}
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => {
                const s = getStats(player.id);
                return (
                  <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{getPlayerName(player)}</div>
                      {player.jerseyNumber && <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>#{player.jerseyNumber}</div>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700' }}>{formatAvg(s)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.ab || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.hits || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.hr || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.rbi || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.runs || 0}</td>
                    {showEdit && canEdit && (
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button onClick={() => startEdit(player)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--red)' }}>✏️</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pitching */}
      {players.some(p => getStats(p.id).ip > 0) && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>
            Pitching
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '300px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                  {['ERA','IP','ER'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.filter(p => getStats(p.id).ip > 0).map((player, i) => {
                  const s = getStats(player.id);
                  return (
                    <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', fontSize: '14px' }}>{getPlayerName(player)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700' }}>{s.era ? s.era.toFixed(2) : '--'}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.ip || 0}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '14px' }}>{s.er || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // Season history view — shows all past seasons per player
  const SeasonHistory = () => {
    const years = [...new Set(
      players.flatMap(p => Object.keys(getSeasonHistory(p.id)))
    )].sort((a, b) => b - a);

    return (
      <div>
        {years.length === 0 ? (
          <div className="empty-state"><p>No season history yet.</p></div>
        ) : years.map(year => (
          <div key={year} style={{ marginBottom: '20px' }}>
            <div style={{
              background: year === currentYear ? 'var(--red)' : 'var(--gray-700)',
              color: 'white', borderRadius: '8px 8px 0 0',
              padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700' }}>
                {year} Season {year === currentYear ? '(Current)' : '(Archived)'}
              </span>
            </div>
            <div className="card" style={{ borderRadius: '0 0 10px 10px', borderTop: 'none', padding: '0', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                      {['AVG','AB','H','HR','RBI','R'].map(h => (
                        <th key={h} style={{ padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, i) => {
                      const s = getSeasonHistory(player.id)[year] || {};
                      return (
                        <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '600', fontSize: '13px' }}>{getPlayerName(player)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700' }}>{formatAvg(s)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.ab || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.hits || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.hr || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.rbi || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.runs || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Stats" actions={canEdit && (
        <button onClick={() => setShowNewSeasonModal(true)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          padding: '0 12px', height: 36, color: 'white', cursor: 'pointer',
          fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '600',
          textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'
        }}>New Season</button>
      )} />

      <div className="page-content">
        {!canEdit && <div className="view-only-banner">👁 Stats are updated by coaches</div>}

        {/* Team Stats Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
          borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white'
        }}>
          <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '8px' }}>
            Team Stats — {tab === 'career' ? 'All-Time' : `${currentYear} Season`}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'AVG', value: '.' + String(Math.round(teamAvg * 1000)).padStart(3, '0') },
              { label: 'R', value: activeTeam.runs || 0 },
              { label: 'HR', value: activeTeam.hr || 0 },
              { label: 'RBI', value: activeTeam.rbi || 0 }
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700' }}>{s.value}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>
            {currentYear}
          </button>
          <button className={`tab ${tab === 'career' ? 'active' : ''}`} onClick={() => setTab('career')}>All-Time</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        </div>

        {tab === 'current' && <StatsTable getStats={getCurrentSeason} showEdit={true} />}
        {tab === 'career' && <StatsTable getStats={getCareer} showEdit={false} />}
        {tab === 'history' && <SeasonHistory />}

        {/* AI Placeholder */}
        <div className="card" style={{ background: 'linear-gradient(135deg, #1e1e2e, #2d1b4e)', border: 'none', marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', color: 'white', textTransform: 'uppercase' }}>AI Lineup Recommendations</span>
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
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Edit Stats</h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '16px' }}>
              {getPlayerName(players.find(p => p.id === editingPlayer))} — {currentYear} Season
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { key: 'ab', label: 'At Bats' }, { key: 'hits', label: 'Hits' },
                { key: 'hr', label: 'Home Runs' }, { key: 'rbi', label: 'RBI' },
                { key: 'runs', label: 'Runs' }, { key: 'sb', label: 'Stolen Bases' },
                { key: 'ip', label: 'Innings Pitched' }, { key: 'er', label: 'Earned Runs' }
              ].map(field => (
                <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{field.label}</label>
                  <input className="form-input" type="number" value={editStats[field.key]}
                    onChange={e => setEditStats(s => ({ ...s, [field.key]: e.target.value }))}
                    min="0" step={field.key === 'ip' ? '0.1' : '1'} style={{ textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => saveStats(editingPlayer)} style={{ marginTop: '16px' }}>Save Stats</button>
          </div>
        </div>
      )}

      {/* New Season Modal */}
      {showNewSeasonModal && (
        <div className="modal-overlay" onClick={() => setShowNewSeasonModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px', textTransform: 'uppercase' }}>Start New Season</h3>
            <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
              This archives the current <strong>{currentYear}</strong> season stats and starts fresh. All-time career stats are preserved automatically.
            </p>
            <div className="card" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#92400E' }}>
                ⚠️ Stats for <strong>{currentYear}</strong> will be archived under Season History. This cannot be undone.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">New Season Year</label>
              <input className="form-input" value={newSeasonYear} onChange={e => setNewSeasonYear(e.target.value)}
                placeholder="e.g. 2027" style={{ textAlign: 'center', fontSize: '20px', fontFamily: 'Oswald, sans-serif' }} />
            </div>
            <button className="btn-primary" onClick={startNewSeason} disabled={!newSeasonYear.trim()}>
              🎉 Start {newSeasonYear || 'New'} Season
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
