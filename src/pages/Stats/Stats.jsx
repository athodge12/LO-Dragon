import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const FIELDING_POSITIONS = ['Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const POS_SHORT = { 'Catcher':'C','1st Base':'1B','2nd Base':'2B','3rd Base':'3B','Shortstop':'SS','Left Field':'LF','Left Center':'LC','Right Center':'RC','Right Field':'RF' };

export default function Stats() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [season, setSeason] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editStats, setEditStats] = useState({});
  const [editFieldingPos, setEditFieldingPos] = useState(FIELDING_POSITIONS[0]);
  const [editFieldingStats, setEditFieldingStats] = useState({ innings: 0, errors: 0 });
  const [editSection, setEditSection] = useState('batting'); // 'batting' | 'fielding'
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('current');
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState('');

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'roster'), orderBy('createdAt')), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'playerStats'), snap => {
      const stats = {};
      snap.docs.forEach(d => { stats[d.id] = d.data(); });
      setAllStats(stats);
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'season'), snap => {
      setSeason(snap.exists() ? snap.data() : { year: '2026' });
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const currentYear = season?.year || '2026';
  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';
  const getCurrentSeason = (id) => allStats[id]?.seasons?.[currentYear] || {};
  const getCareer = (id) => allStats[id]?.career || {};
  const getSeasonHistory = (id) => allStats[id]?.seasons || {};
  const getFielding = (id) => allStats[id]?.fielding || {};

  const startEdit = (player) => {
    const s = getCurrentSeason(player.id);
    setEditingPlayer(player.id);
    setEditStats({
      ab: s.ab || 0,
      singles: s.singles || 0,
      doubles: s.doubles || 0,
      triples: s.triples || 0,
      hr: s.hr || 0,
      rbi: s.rbi || 0,
    });
    const pos = FIELDING_POSITIONS[0];
    setEditFieldingPos(pos);
    const f = allStats[player.id]?.fielding || {};
    setEditFieldingStats(f[pos] || { innings: 0, errors: 0 });
    setEditSection('batting');
  };

  const saveStats = async (playerId) => {
    const ab = parseInt(editStats.ab) || 0;
    const singles = parseInt(editStats.singles) || 0;
    const doubles = parseInt(editStats.doubles) || 0;
    const triples = parseInt(editStats.triples) || 0;
    const hr = parseInt(editStats.hr) || 0;
    const hits = singles + doubles + triples + hr;
    const avg = ab > 0 ? hits / ab : 0;

    const newSeasonStats = { ab, singles, doubles, triples, hr, hits, rbi: parseInt(editStats.rbi) || 0, avg };

    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    const updatedSeasons = { ...(current.seasons || {}), [currentYear]: newSeasonStats };

    const career = Object.values(updatedSeasons).reduce((acc, s) => ({
      ab: (acc.ab || 0) + (s.ab || 0),
      hits: (acc.hits || 0) + (s.hits || 0),
      singles: (acc.singles || 0) + (s.singles || 0),
      doubles: (acc.doubles || 0) + (s.doubles || 0),
      triples: (acc.triples || 0) + (s.triples || 0),
      hr: (acc.hr || 0) + (s.hr || 0),
      rbi: (acc.rbi || 0) + (s.rbi || 0),
    }), {});
    career.avg = career.ab > 0 ? career.hits / career.ab : 0;

    await setDoc(ref, { ...current, seasons: updatedSeasons, career }, { merge: true });
    setEditingPlayer(null);
    setToast('Stats saved!');
  };

  const saveFielding = async (playerId) => {
    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    const existing = current.fielding || {};
    const innings = parseInt(editFieldingStats.innings) || 0;
    const errors = parseInt(editFieldingStats.errors) || 0;
    await setDoc(ref, {
      ...current,
      fielding: { ...existing, [editFieldingPos]: { innings, errors } }
    }, { merge: true });
    setToast('Fielding stats saved!');
  };

  const formatAvg = (s) => {
    if (!s.ab) return '.000';
    const avg = s.avg !== undefined ? s.avg : (s.hits || 0) / s.ab;
    return '.' + String(Math.round(avg * 1000)).padStart(3, '0');
  };

  const startNewSeason = async () => {
    if (!newSeasonYear.trim()) return;
    await setDoc(doc(db, 'settings', 'season'), { year: newSeasonYear.trim() });
    setShowNewSeasonModal(false);
    setNewSeasonYear('');
    setToast(`${newSeasonYear} season started!`);
  };

  const calcTeamTotals = (fn) => players.reduce((acc, p) => {
    const s = fn(p.id);
    return {
      hits: (acc.hits || 0) + (s.hits || 0),
      hr: (acc.hr || 0) + (s.hr || 0),
      rbi: (acc.rbi || 0) + (s.rbi || 0),
      ab: (acc.ab || 0) + (s.ab || 0),
    };
  }, {});

  const currentTeam = calcTeamTotals(getCurrentSeason);
  const careerTeam = calcTeamTotals(getCareer);
  const activeTeam = tab === 'career' ? careerTeam : currentTeam;
  const teamAvg = activeTeam.ab > 0 ? activeTeam.hits / activeTeam.ab : 0;

  // Fielding cell color: green=good, yellow=ok, red=rough, gray=never played
  const fieldingColor = (f) => {
    if (!f || !f.innings) return { bg: 'var(--gray-100)', text: 'var(--gray-300)' };
    const errPer3Inn = f.errors / f.innings * 3; // errors per 3 innings
    if (errPer3Inn === 0) return { bg: '#DCFCE7', text: '#16A34A' };
    if (errPer3Inn <= 1) return { bg: '#FEF9C3', text: '#92400E' };
    return { bg: '#FEE2E2', text: '#B91C1C' };
  };

  const BattingTable = ({ getStats, showEdit }) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
              {['AVG','AB','H','1B','2B','3B','HR','RBI'].map(h => (
                <th key={h} style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{h}</th>
              ))}
              {showEdit && canEdit && <th style={{ padding: '10px 6px' }} />}
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
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', color: 'var(--red)' }}>{formatAvg(s)}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.ab || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>{s.hits || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.singles || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.doubles || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.triples || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', fontWeight: '700', color: s.hr > 0 ? 'var(--red)' : 'inherit' }}>{s.hr || 0}</td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.rbi || 0}</td>
                  {showEdit && canEdit && (
                    <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                      <button onClick={() => startEdit(player)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✏️</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Rotation helper: grid of players vs positions showing games + errors
  const RotationView = () => (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '10px', lineHeight: '1.5' }}>
        Shows games played (G) and errors (E) per position. Green = strong, yellow = OK, red = rough, gray = never played.
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-800, #1f2937)', borderBottom: '2px solid var(--gray-200)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'white', textTransform: 'uppercase', background: '#1f2937' }}>Player</th>
                {FIELDING_POSITIONS.map(pos => (
                  <th key={pos} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: 'white', textTransform: 'uppercase', background: '#1f2937', whiteSpace: 'nowrap' }}>
                    {POS_SHORT[pos]}
                  </th>
                ))}
                {canEdit && <th style={{ padding: '8px 4px', background: '#1f2937' }} />}
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => {
                const f = getFielding(player.id);
                return (
                  <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {getPlayerName(player)}
                      {player.jerseyNumber && <span style={{ color: 'var(--gray-400)', fontSize: '11px', marginLeft: '4px' }}>#{player.jerseyNumber}</span>}
                    </td>
                    {FIELDING_POSITIONS.map(pos => {
                      const pf = f[pos];
                      const colors = fieldingColor(pf);
                      return (
                        <td key={pos} style={{ padding: '6px 4px', textAlign: 'center' }}>
                          {pf?.innings ? (
                            <div style={{
                              background: colors.bg, color: colors.text,
                              borderRadius: '6px', padding: '3px 4px',
                              fontSize: '10px', fontWeight: '700', lineHeight: '1.3'
                            }}>
                              <div>{pf.innings}inn</div>
                              <div>{pf.errors}E</div>
                            </div>
                          ) : (
                            <div style={{ width: '28px', height: '28px', background: 'var(--gray-100)', borderRadius: '6px', margin: '0 auto' }} />
                          )}
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <button onClick={() => { setEditingPlayer(player.id); setEditSection('fielding'); const pos = FIELDING_POSITIONS[0]; setEditFieldingPos(pos); const ff = allStats[player.id]?.fielding || {}; setEditFieldingStats(ff[pos] || { games: 0, errors: 0 }); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✏️</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
        {[
          { color: '#DCFCE7', text: '#16A34A', label: '0 errors' },
          { color: '#FEF9C3', text: '#92400E', label: '≤1 error/3 inn' },
          { color: '#FEE2E2', text: '#B91C1C', label: '>1 error/3 inn' },
          { color: 'var(--gray-100)', text: 'var(--gray-400)', label: 'Never played' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--gray-500)' }}>
            <div style={{ width: 12, height: 12, borderRadius: '3px', background: l.color, border: `1px solid ${l.color}` }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );

  const SeasonHistory = () => {
    const years = [...new Set(players.flatMap(p => Object.keys(getSeasonHistory(p.id))))].sort((a, b) => b - a);
    return (
      <div>
        {years.length === 0 ? (
          <div className="empty-state"><p>No season history yet.</p></div>
        ) : years.map(year => (
          <div key={year} style={{ marginBottom: '20px' }}>
            <div style={{ background: year === currentYear ? 'var(--red)' : 'var(--gray-700)', color: 'white', borderRadius: '8px 8px 0 0', padding: '8px 14px' }}>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700' }}>
                {year} Season {year === currentYear ? '(Current)' : '(Archived)'}
              </span>
            </div>
            <div className="card" style={{ borderRadius: '0 0 10px 10px', borderTop: 'none', padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '460px' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                      {['AVG','AB','H','1B','2B','3B','HR','RBI'].map(h => (
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
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', color: 'var(--red)' }}>{formatAvg(s)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.ab || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>{s.hits || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.singles || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.doubles || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.triples || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.hr || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.rbi || 0}</td>
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

        {/* Team Banner */}
        <div style={{ background: 'linear-gradient(135deg, #CC1B1B, #8B0000)', borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '8px' }}>
            Team Batting — {tab === 'career' ? 'All-Time' : `${currentYear} Season`}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'AVG', value: '.' + String(Math.round(teamAvg * 1000)).padStart(3, '0') },
              { label: 'H', value: activeTeam.hits || 0 },
              { label: 'HR', value: activeTeam.hr || 0 },
              { label: 'RBI', value: activeTeam.rbi || 0 },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700' }}>{s.value}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>{currentYear}</button>
          <button className={`tab ${tab === 'career' ? 'active' : ''}`} onClick={() => setTab('career')}>All-Time</button>
          <button className={`tab ${tab === 'fielding' ? 'active' : ''}`} onClick={() => setTab('fielding')}>Fielding</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        </div>

        {tab === 'current' && <BattingTable getStats={getCurrentSeason} showEdit={true} />}
        {tab === 'career' && <BattingTable getStats={getCareer} showEdit={false} />}
        {tab === 'fielding' && <RotationView />}
        {tab === 'history' && <SeasonHistory />}

        {/* Stat Glossary */}
        <div className="card" style={{ marginTop: '14px' }}>
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', color: 'var(--gray-700)' }}>
            📖 Stat Guide
          </div>
          {tab !== 'fielding' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { abbr: 'AVG', name: 'Batting Average', desc: 'Hits divided by At Bats. .300 is excellent.' },
                { abbr: 'AB',  name: 'At Bats',         desc: 'Number of times a player batted (excluding walks).' },
                { abbr: 'H',   name: 'Hits',            desc: 'Total hits — 1B + 2B + 3B + HR combined.' },
                { abbr: '1B',  name: 'Single',          desc: 'Hit where the batter reaches 1st base.' },
                { abbr: '2B',  name: 'Double',          desc: 'Hit where the batter reaches 2nd base.' },
                { abbr: '3B',  name: 'Triple',          desc: 'Hit where the batter reaches 3rd base.' },
                { abbr: 'HR',  name: 'Home Run',        desc: 'Batter rounds all bases and scores.' },
                { abbr: 'RBI', name: 'Runs Batted In',  desc: 'Number of runs scored due to the batter\'s hit.' },
              ].map(s => (
                <div key={s.abbr} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{
                    minWidth: '36px', fontFamily: 'Oswald, sans-serif', fontWeight: '700',
                    fontSize: '13px', color: 'var(--red)', paddingTop: '1px'
                  }}>{s.abbr}</span>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--black)' }}>{s.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--gray-500)', marginLeft: '6px' }}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { abbr: 'Inn', name: 'Innings', desc: 'Total innings played at that position across all games.' },
                { abbr: 'E',   name: 'Errors',  desc: 'Mistakes made in the field at that position.' },
              ].map(s => (
                <div key={s.abbr} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{
                    minWidth: '36px', fontFamily: 'Oswald, sans-serif', fontWeight: '700',
                    fontSize: '13px', color: 'var(--red)', paddingTop: '1px'
                  }}>{s.abbr}</span>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--black)' }}>{s.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--gray-500)', marginLeft: '6px' }}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingPlayer && (
        <div className="modal-overlay" onClick={() => setEditingPlayer(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Edit Stats</h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '12px' }}>
              {getPlayerName(players.find(p => p.id === editingPlayer))} — {currentYear}
            </p>

            {/* Section toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['batting', 'fielding'].map(s => (
                <button key={s} onClick={() => setEditSection(s)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${editSection === s ? 'var(--red)' : 'var(--gray-200)'}`,
                  background: editSection === s ? '#FEF2F2' : 'white',
                  color: editSection === s ? 'var(--red)' : 'var(--gray-600)',
                  fontWeight: '700', fontSize: '13px', textTransform: 'uppercase'
                }}>{s === 'batting' ? '⚾ Batting' : '🧤 Fielding'}</button>
              ))}
            </div>

            {editSection === 'batting' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { key: 'ab', label: 'At Bats' },
                    { key: 'singles', label: '1B — Singles' },
                    { key: 'doubles', label: '2B — Doubles' },
                    { key: 'triples', label: '3B — Triples' },
                    { key: 'hr', label: 'HR — Home Runs' },
                    { key: 'rbi', label: 'RBI' },
                  ].map(field => (
                    <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{field.label}</label>
                      <input className="form-input" type="number" min="0" step="1"
                        value={editStats[field.key]}
                        onChange={e => setEditStats(s => ({ ...s, [field.key]: e.target.value }))}
                        style={{ textAlign: 'center', fontSize: '18px', fontFamily: 'Oswald, sans-serif' }} />
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--gray-50)', borderRadius: '8px', padding: '10px 12px', marginTop: '12px', fontSize: '13px', color: 'var(--gray-500)' }}>
                  Total Hits: <strong style={{ color: 'var(--black)' }}>
                    {(parseInt(editStats.singles) || 0) + (parseInt(editStats.doubles) || 0) + (parseInt(editStats.triples) || 0) + (parseInt(editStats.hr) || 0)}
                  </strong>
                  &nbsp;· AVG: <strong style={{ color: 'var(--red)' }}>
                    {editStats.ab > 0
                      ? '.' + String(Math.round(((parseInt(editStats.singles)||0)+(parseInt(editStats.doubles)||0)+(parseInt(editStats.triples)||0)+(parseInt(editStats.hr)||0)) / parseInt(editStats.ab) * 1000)).padStart(3,'0')
                      : '.000'}
                  </strong>
                </div>
                <button className="btn-primary" onClick={() => saveStats(editingPlayer)} style={{ marginTop: '16px' }}>Save Batting Stats</button>
              </>
            )}

            {editSection === 'fielding' && (
              <>
                <div className="form-group">
                  <label className="form-label">Position</label>
                  <select className="form-select" value={editFieldingPos} onChange={e => {
                    const pos = e.target.value;
                    setEditFieldingPos(pos);
                    const f = allStats[editingPlayer]?.fielding || {};
                    setEditFieldingStats(f[pos] || { innings: 0, errors: 0 });
                  }}>
                    {FIELDING_POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Innings Played</label>
                    <input className="form-input" type="number" min="0" step="1"
                      value={editFieldingStats.innings}
                      onChange={e => setEditFieldingStats(s => ({ ...s, innings: e.target.value }))}
                      style={{ textAlign: 'center', fontSize: '18px', fontFamily: 'Oswald, sans-serif' }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Errors</label>
                    <input className="form-input" type="number" min="0" step="1"
                      value={editFieldingStats.errors}
                      onChange={e => setEditFieldingStats(s => ({ ...s, errors: e.target.value }))}
                      style={{ textAlign: 'center', fontSize: '18px', fontFamily: 'Oswald, sans-serif' }} />
                  </div>
                </div>
                <button className="btn-primary" onClick={() => saveFielding(editingPlayer)} style={{ marginTop: '16px' }}>Save Fielding Stats</button>
              </>
            )}
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
              Archives <strong>{currentYear}</strong> stats and starts fresh. Career totals are preserved.
            </p>
            <div className="card" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#92400E' }}>
                ⚠️ Stats for <strong>{currentYear}</strong> will be archived. This cannot be undone.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">New Season Year</label>
              <input className="form-input" value={newSeasonYear} onChange={e => setNewSeasonYear(e.target.value)}
                placeholder="e.g. 2027" style={{ textAlign: 'center', fontSize: '20px', fontFamily: 'Oswald, sans-serif' }} />
            </div>
            <button className="btn-primary" onClick={startNewSeason} disabled={!newSeasonYear.trim()}>
              Start {newSeasonYear || 'New'} Season
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
