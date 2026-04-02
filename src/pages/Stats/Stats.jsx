import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import LogGameModal from '../../components/LogGameModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';

const FIELDING_POSITIONS = ['Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const POS_SHORT = { 'Catcher':'C','1st Base':'1B','2nd Base':'2B','3rd Base':'3B','Shortstop':'SS','Left Field':'LF','Left Center':'LC','Right Center':'RC','Right Field':'RF' };

const POSITION_OUT_PCT = {
  'Pitcher':      0.60,
  'Catcher':      0.10,
  '1st Base':     0.80,
  '2nd Base':     0.50,
  '3rd Base':     0.20,
  'Shortstop':    0.40,
  'Left Field':   0.05,
  'Left Center':  0.05,
  'Right Center': 0.05,
  'Right Field':  0.05,
};

function fitScore(fieldingData, position) {
  const base = POSITION_OUT_PCT[position] ?? 0.3;
  const f = fieldingData?.[position];
  if (f && f.innings > 0) {
    const qualityMult = Math.max(0.25, 1 - f.errors / f.innings);
    return { score: base * qualityMult, label: f.innings >= 3 ? 'solid data' : 'limited data', innings: f.innings, errors: f.errors };
  }
  return { score: base * 0.65, label: 'no data', innings: 0, errors: 0 };
}

function scoreColor(score) {
  if (score >= 0.60) return { bg: '#DCFCE7', text: '#16A34A' };
  if (score >= 0.35) return { bg: '#FEF9C3', text: '#92400E' };
  return { bg: '#FEE2E2', text: '#B91C1C' };
}

const PRACTICE_HIT_ZONES = [
  { key: 'lf',         label: 'LF', row: 0 }, { key: 'lc',         label: 'LC', row: 0 },
  { key: 'cf',         label: 'CF', row: 0 }, { key: 'rc',         label: 'RC', row: 0 },
  { key: 'rf',         label: 'RF', row: 0 }, { key: 'thirdBase',  label: '3B', row: 1 },
  { key: 'ss',         label: 'SS', row: 1 }, { key: 'pitcher',    label: 'P',  row: 1 },
  { key: 'secondBase', label: '2B', row: 1 }, { key: 'firstBase',  label: '1B', row: 1 },
];
const BLANK_ZONES = { lf:0, lc:0, cf:0, rc:0, rf:0, thirdBase:0, ss:0, pitcher:0, secondBase:0, firstBase:0 };

export default function Stats() {
  const { isCoach, isBookkeeper } = useAuth();
  const canEdit = isCoach || isBookkeeper;
  const [players, setPlayers] = useState([]);
  const [allStats, setAllStats] = useState({});
  const [season, setSeason] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editStats, setEditStats] = useState({});
  const [editFieldingPos, setEditFieldingPos] = useState(FIELDING_POSITIONS[0]);
  const [editFieldingStats, setEditFieldingStats] = useState({ innings: 0, putouts: 0, assists: 0, errors: 0 });
  const [editSection, setEditSection] = useState('batting'); // 'batting' | 'fielding'
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('current');
  const [showNewSeasonModal, setShowNewSeasonModal] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState('');
  const [showLogGame, setShowLogGame] = useState(false);
  const [games, setGames] = useState([]);
  const [expandedLogGame, setExpandedLogGame] = useState(null);
  const [sortCol, setSortCol] = useState('avg');
  const [sortDir, setSortDir] = useState('desc');
  const [chartStat, setChartStat] = useState('avg');
  const [chartPlayer, setChartPlayer] = useState(null);

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
    unsubs.push(onSnapshot(query(collection(db, 'games'), orderBy('date', 'desc')), snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  const currentYear = season?.year || '2026';
  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown';
  const getCurrentSeason = (id) => allStats[id]?.seasons?.[currentYear] || {};
  const getCareer = (id) => allStats[id]?.career || {};
  const getSeasonHistory = (id) => allStats[id]?.seasons || {};
  const getFielding = (id) => allStats[id]?.fielding || {};

  const calcOBP = (hits, bb, ab) => {
    const denom = ab + bb;
    return denom > 0 ? (hits + bb) / denom : 0;
  };

  const formatOBP = (s) => {
    const obp = s.obp !== undefined ? s.obp : calcOBP(s.hits || 0, s.bb || 0, s.ab || 0);
    return '.' + String(Math.round(obp * 1000)).padStart(3, '0');
  };

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
      k: s.k || 0,
      bb: s.bb || 0,
      runs: s.runs || 0,
    });
    const pos = FIELDING_POSITIONS[0];
    setEditFieldingPos(pos);
    const f = allStats[player.id]?.fielding || {};
    setEditFieldingStats(f[pos] || { innings: 0, putouts: 0, assists: 0, errors: 0 });
    setEditSection('batting');
  };

  const saveStats = async (playerId) => {
    const ab = parseInt(editStats.ab) || 0;
    const singles = parseInt(editStats.singles) || 0;
    const doubles = parseInt(editStats.doubles) || 0;
    const triples = parseInt(editStats.triples) || 0;
    const hr = parseInt(editStats.hr) || 0;
    const rbi = parseInt(editStats.rbi) || 0;
    const k   = parseInt(editStats.k)   || 0;
    const bb  = parseInt(editStats.bb)  || 0;
    const runs = parseInt(editStats.runs) || 0;
    const hits = singles + doubles + triples + hr;
    const avg = ab > 0 ? hits / ab : 0;
    const obp = calcOBP(hits, bb, ab);

    const newSeasonStats = { ab, singles, doubles, triples, hr, hits, rbi, avg, k, bb, runs, obp };

    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    const updatedSeasons = { ...(current.seasons || {}), [currentYear]: newSeasonStats };

    const career = Object.values(updatedSeasons).reduce((acc, s) => ({
      ab:      (acc.ab      || 0) + (s.ab      || 0),
      hits:    (acc.hits    || 0) + (s.hits    || 0),
      singles: (acc.singles || 0) + (s.singles || 0),
      doubles: (acc.doubles || 0) + (s.doubles || 0),
      triples: (acc.triples || 0) + (s.triples || 0),
      hr:      (acc.hr      || 0) + (s.hr      || 0),
      rbi:     (acc.rbi     || 0) + (s.rbi     || 0),
      k:       (acc.k       || 0) + (s.k       || 0),
      bb:      (acc.bb      || 0) + (s.bb      || 0),
      runs:    (acc.runs    || 0) + (s.runs    || 0),
    }), {});
    career.avg = career.ab > 0 ? career.hits / career.ab : 0;
    career.obp = calcOBP(career.hits || 0, career.bb || 0, career.ab || 0);

    await setDoc(ref, { ...current, seasons: updatedSeasons, career }, { merge: true });
    setEditingPlayer(null);
    setToast('Stats saved!');
  };

  const saveFielding = async (playerId) => {
    const ref = doc(db, 'playerStats', playerId);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    const existing = current.fielding || {};
    const innings  = parseInt(editFieldingStats.innings)  || 0;
    const putouts  = parseInt(editFieldingStats.putouts)  || 0;
    const assists  = parseInt(editFieldingStats.assists)  || 0;
    const errors   = parseInt(editFieldingStats.errors)   || 0;
    await setDoc(ref, {
      ...current,
      fielding: { ...existing, [editFieldingPos]: { innings, putouts, assists, errors } }
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

  const deleteGameLog = async (gameKey) => {
    for (const player of players) {
      const ref = doc(db, 'playerStats', player.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const current = snap.data();
      const updatedLogs = { ...(current.gameLogs || {}) };
      const deletedEntry = updatedLogs[gameKey];
      if (!deletedEntry) continue;
      delete updatedLogs[gameKey];
      const year = deletedEntry.year || gameKey.split('_')[0];

      // Recalc batting season totals
      const logs = Object.values(updatedLogs).filter(g => g.year === year);
      let updatedSeasons = current.seasons || {};
      if (logs.length > 0) {
        const t = logs.reduce((a, g) => ({
          ab:      (a.ab      || 0) + (g.ab      || 0),
          singles: (a.singles || 0) + (g.singles || 0),
          doubles: (a.doubles || 0) + (g.doubles || 0),
          triples: (a.triples || 0) + (g.triples || 0),
          hr:      (a.hr      || 0) + (g.hr      || 0),
          hits:    (a.hits    || 0) + (g.hits    || 0),
          rbi:     (a.rbi     || 0) + (g.rbi     || 0),
          k:       (a.k       || 0) + (g.k       || 0),
          bb:      (a.bb      || 0) + (g.bb      || 0),
          runs:    (a.runs    || 0) + (g.runs    || 0),
        }), {});
        t.avg = t.ab > 0 ? t.hits / t.ab : 0;
        t.obp = calcOBP(t.hits || 0, t.bb || 0, t.ab || 0);
        updatedSeasons = { ...updatedSeasons, [year]: t };
      }
      const career = Object.values(updatedSeasons).reduce((acc, s) => ({
        ab:      (acc.ab      || 0) + (s.ab      || 0),
        hits:    (acc.hits    || 0) + (s.hits    || 0),
        singles: (acc.singles || 0) + (s.singles || 0),
        doubles: (acc.doubles || 0) + (s.doubles || 0),
        triples: (acc.triples || 0) + (s.triples || 0),
        hr:      (acc.hr      || 0) + (s.hr      || 0),
        rbi:     (acc.rbi     || 0) + (s.rbi     || 0),
        k:       (acc.k       || 0) + (s.k       || 0),
        bb:      (acc.bb      || 0) + (s.bb      || 0),
        runs:    (acc.runs    || 0) + (s.runs    || 0),
      }), {});
      career.avg = career.ab > 0 ? career.hits / career.ab : 0;
      career.obp = calcOBP(career.hits || 0, career.bb || 0, career.ab || 0);

      // Recalc fielding from remaining logs
      const fieldingTotals = {};
      Object.values(updatedLogs).forEach(g => {
        if (!g.fielding) return;
        Object.entries(g.fielding).forEach(([pos, f]) => {
          if (!fieldingTotals[pos]) fieldingTotals[pos] = { innings: 0, putouts: 0, assists: 0, errors: 0 };
          fieldingTotals[pos].innings += parseInt(f.innings) || 0;
          fieldingTotals[pos].putouts += parseInt(f.putouts) || 0;
          fieldingTotals[pos].assists += parseInt(f.assists) || 0;
          fieldingTotals[pos].errors  += parseInt(f.errors)  || 0;
        });
      });
      const mergedFielding = { ...(current.fielding || {}), ...fieldingTotals };

      await setDoc(ref, { ...current, gameLogs: updatedLogs, seasons: updatedSeasons, career, fielding: mergedFielding }, { merge: true });
    }
    setToast('Game log deleted. Season totals updated.');
  };

  const calcTeamTotals = (fn) => players.reduce((acc, p) => {
    const s = fn(p.id);
    return {
      hits: (acc.hits || 0) + (s.hits || 0),
      hr:   (acc.hr   || 0) + (s.hr   || 0),
      rbi:  (acc.rbi  || 0) + (s.rbi  || 0),
      ab:   (acc.ab   || 0) + (s.ab   || 0),
      bb:   (acc.bb   || 0) + (s.bb   || 0),
      runs: (acc.runs || 0) + (s.runs || 0),
      k:    (acc.k    || 0) + (s.k    || 0),
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

  const BATTING_COLS = [
    { key: 'avg',     label: 'AVG', getValue: s => s.avg !== undefined ? s.avg : (s.hits||0)/(s.ab||1) },
    { key: 'obp',     label: 'OBP', getValue: s => s.obp !== undefined ? s.obp : calcOBP(s.hits||0, s.bb||0, s.ab||0) },
    { key: 'ab',      label: 'AB',  getValue: s => s.ab      || 0 },
    { key: 'hits',    label: 'H',   getValue: s => s.hits    || 0 },
    { key: 'singles', label: '1B',  getValue: s => s.singles || 0 },
    { key: 'doubles', label: '2B',  getValue: s => s.doubles || 0 },
    { key: 'triples', label: '3B',  getValue: s => s.triples || 0 },
    { key: 'hr',      label: 'HR',  getValue: s => s.hr      || 0 },
    { key: 'rbi',     label: 'RBI', getValue: s => s.rbi     || 0 },
    { key: 'runs',    label: 'R',   getValue: s => s.runs    || 0 },
    { key: 'k',       label: 'K',   getValue: s => s.k       || 0 },
    { key: 'bb',      label: 'BB',  getValue: s => s.bb      || 0 },
  ];

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(key); setSortDir('desc'); }
  };

  const BattingTable = ({ getStats, showEdit }) => {
    const col = BATTING_COLS.find(c => c.key === sortCol) || BATTING_COLS[0];
    const sorted = [...players].sort((a, b) => {
      const av = col.getValue(getStats(a.id));
      const bv = col.getValue(getStats(b.id));
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                {BATTING_COLS.map(h => (
                  <th key={h.key} onClick={() => handleSort(h.key)} style={{ padding: '10px 6px', textAlign: 'center', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', color: sortCol === h.key ? 'var(--red)' : 'var(--gray-500)', whiteSpace: 'nowrap' }}>
                    {h.label}{sortCol === h.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </th>
                ))}
                {showEdit && canEdit && <th style={{ padding: '10px 6px' }} />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((player, i) => {
                const s = getStats(player.id);
                return (
                  <tr key={player.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{getPlayerName(player)}</div>
                      {player.jerseyNumber && <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>#{player.jerseyNumber}</div>}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', color: 'var(--red)' }}>{formatAvg(s)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', color: 'var(--blue)' }}>{formatOBP(s)}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.ab || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>{s.hits || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.singles || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.doubles || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.triples || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', fontWeight: '700', color: s.hr > 0 ? 'var(--red)' : 'inherit' }}>{s.hr || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.rbi || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.runs || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.k || 0}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px' }}>{s.bb || 0}</td>
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
  };

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
                              <div>{(pf.putouts||0)+(pf.assists||0)}outs</div>
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
                      {['AVG','OBP','AB','H','1B','2B','3B','HR','RBI','R','K','BB'].map(h => (
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
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '700', color: 'var(--red)' }}>{formatAvg(s)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '700', color: 'var(--blue)' }}>{formatOBP(s)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.ab || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px', fontWeight: '600' }}>{s.hits || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.singles || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.doubles || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.triples || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.hr || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.rbi || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.runs || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.k || 0}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>{s.bb || 0}</td>
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

  // Build a sorted list of unique game keys across all players
  const allGameKeys = [...new Set(
    Object.values(allStats).flatMap(s => Object.keys(s.gameLogs || {}))
  )].sort((a, b) => {
    const dateA = Object.values(allStats).find(s => s.gameLogs?.[a])?.gameLogs?.[a]?.date || '';
    const dateB = Object.values(allStats).find(s => s.gameLogs?.[b])?.gameLogs?.[b]?.date || '';
    return dateB.localeCompare(dateA);
  });

  const GameLogView = () => {
    const [deleteConfirmKey, setDeleteConfirmKey] = useState(null);
    if (allGameKeys.length === 0) {
      return <div className="empty-state"><p>No games logged yet. Tap "Log Game" to add one.</p></div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {allGameKeys.map(gameKey => {
          // Get metadata from first player that has this entry
          const firstEntry = Object.values(allStats).find(s => s.gameLogs?.[gameKey])?.gameLogs?.[gameKey];
          if (!firstEntry) return null;
          const playerCount = players.filter(p => {
            const e = allStats[p.id]?.gameLogs?.[gameKey];
            return e && (e.ab > 0 || e.hits > 0);
          }).length;
          const isExpanded = expandedLogGame === gameKey;
          return (
            <div key={gameKey} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedLogGame(isExpanded ? null : gameKey)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer', background: 'white' }}
              >
                <div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', fontWeight: '700' }}>vs {firstEntry.opponent}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                    {firstEntry.date} &middot; {playerCount} player{playerCount !== 1 ? 's' : ''} logged
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canEdit && (
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirmKey(gameKey); }}
                      style={{ background: '#FEE2E2', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '700', color: '#B91C1C', cursor: 'pointer' }}>
                      Delete
                    </button>
                  )}
                  <span style={{ fontSize: '18px', color: 'var(--gray-400)' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--gray-100)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '540px' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>Player</th>
                        {['AB','H','1B','2B','3B','HR','RBI','R','K','BB'].map(h => (
                          <th key={h} style={{ padding: '8px 5px', textAlign: 'center', fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player, i) => {
                        const e = allStats[player.id]?.gameLogs?.[gameKey] || {};
                        return (
                          <tr key={player.id} style={{ borderTop: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: '600', fontSize: '13px' }}>{getPlayerName(player)}</td>
                            {[e.ab||0, e.hits||0, e.singles||0, e.doubles||0, e.triples||0, e.hr||0, e.rbi||0, e.runs||0, e.k||0, e.bb||0].map((v, idx) => (
                              <td key={idx} style={{ padding: '8px 5px', textAlign: 'center', fontSize: '13px' }}>{v}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {deleteConfirmKey && (
          <div className="modal-overlay" onClick={() => setDeleteConfirmKey(null)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px' }}>Delete Game Log?</h3>
              <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
                This will remove all player entries for this game and recalculate season totals. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setDeleteConfirmKey(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--gray-200)', background: 'white', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button onClick={async () => { await deleteGameLog(deleteConfirmKey); setDeleteConfirmKey(null); }} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--red)', color: 'white', cursor: 'pointer', fontWeight: '700' }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const CHART_STATS = [
    { key: 'avg',  label: 'AVG',  fmt: v => '.' + String(Math.round(v * 1000)).padStart(3, '0'), get: s => s.avg !== undefined ? s.avg : (s.hits||0)/(s.ab||1) },
    { key: 'hits', label: 'H',    fmt: v => v, get: s => s.hits || 0 },
    { key: 'hr',   label: 'HR',   fmt: v => v, get: s => s.hr || 0 },
    { key: 'rbi',  label: 'RBI',  fmt: v => v, get: s => s.rbi || 0 },
    { key: 'runs', label: 'R',    fmt: v => v, get: s => s.runs || 0 },
    { key: 'bb',   label: 'BB',   fmt: v => v, get: s => s.bb || 0 },
    { key: 'k',    label: 'K',    fmt: v => v, get: s => s.k || 0 },
    { key: 'obp',  label: 'OBP',  fmt: v => '.' + String(Math.round(v * 1000)).padStart(3, '0'), get: s => s.obp !== undefined ? s.obp : calcOBP(s.hits||0, s.bb||0, s.ab||0) },
  ];

  const ChartsView = () => {
    const statDef = CHART_STATS.find(s => s.key === chartStat) || CHART_STATS[0];
    const getStatsForChart = tab === 'career' ? getCareer : getCurrentSeason;
    const firstName = (p) => {
      const name = getPlayerName(p);
      return name.split(' ')[0] || name;
    };

    // Leaderboard bar chart data
    const barData = [...players]
      .map(p => ({ name: firstName(p), value: statDef.get(getStatsForChart(p.id)), id: p.id }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    const COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const barColor = (i) => i < 3 ? COLORS[i] : '#CC1B1B';

    // Individual player trend (game-by-game cumulative AVG)
    const trendPlayer = chartPlayer ? players.find(p => p.id === chartPlayer) : null;
    let trendData = [];
    if (trendPlayer) {
      const logs = allStats[trendPlayer.id]?.gameLogs || {};
      const sorted = Object.entries(logs)
        .filter(([, e]) => e.ab > 0 || e.hits > 0)
        .sort(([, a], [, b]) => (a.date || '').localeCompare(b.date || ''));
      let cumAB = 0, cumH = 0;
      trendData = sorted.map(([, e], i) => {
        cumAB += e.ab || 0;
        cumH += e.hits || 0;
        const avg = cumAB > 0 ? cumH / cumAB : 0;
        return { game: `G${i + 1}`, avg: parseFloat(avg.toFixed(3)), label: e.opponent || `Game ${i+1}` };
      });
    }

    return (
      <div>
        {/* Stat selector */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {CHART_STATS.map(s => (
            <button key={s.key} onClick={() => setChartStat(s.key)} style={{
              padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontWeight: '700', fontSize: '12px',
              border: `1.5px solid ${chartStat === s.key ? 'var(--red)' : 'var(--gray-200)'}`,
              background: chartStat === s.key ? '#FEF2F2' : 'white',
              color: chartStat === s.key ? 'var(--red)' : 'var(--gray-500)'
            }}>{s.label}</button>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--gray-600)', marginBottom: '12px' }}>
            {statDef.label} Leaderboard — {tab === 'career' ? 'All-Time' : `${currentYear}`}
          </div>
          {barData.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(barData.length * 38, 120)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => statDef.key === 'avg' || statDef.key === 'obp' ? ('.' + String(Math.round(v * 1000)).padStart(3,'0')) : v} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={70} />
                <Tooltip formatter={(v) => [statDef.fmt(v), statDef.label]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {barData.map((_, i) => <Cell key={i} fill={barColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Individual AVG trend */}
        <div className="card">
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--gray-600)', marginBottom: '10px' }}>
            Season AVG Trend — Individual
          </div>
          <select className="form-select" value={chartPlayer || ''} onChange={e => setChartPlayer(e.target.value || null)} style={{ marginBottom: '12px' }}>
            <option value="">Select a player…</option>
            {players.map(p => <option key={p.id} value={p.id}>{getPlayerName(p)}</option>)}
          </select>
          {trendPlayer && trendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="game" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 1]} tickFormatter={v => '.' + String(Math.round(v * 1000)).padStart(3,'0')} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => ['.' + String(Math.round(v * 1000)).padStart(3,'0'), 'Cumulative AVG']} labelFormatter={(l, payload) => payload?.[0]?.payload?.label || l} />
                <Line type="monotone" dataKey="avg" stroke="#CC1B1B" strokeWidth={2} dot={{ r: 4, fill: '#CC1B1B' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : trendPlayer && trendData.length <= 1 ? (
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Need at least 2 games logged to show a trend</p>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', padding: '16px 0' }}>Select a player above to see their batting average trend game by game</p>
          )}
        </div>
      </div>
    );
  };

  const BestFitView = () => {
    const [dataSource, setDataSource] = useState('practice');
    const ALL_POSITIONS = ['Pitcher', ...FIELDING_POSITIONS];

    const getFieldingFor = (playerId) =>
      dataSource === 'practice'
        ? allStats[playerId]?.practiceAgg?.fielding
        : allStats[playerId]?.fielding;

    return (
      <div style={{ marginTop: '14px' }}>
        {/* Toggle */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {['practice', 'games'].map(src => (
            <button key={src} onClick={() => setDataSource(src)} style={{
              flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontWeight: '700', fontSize: '13px', textTransform: 'capitalize',
              background: dataSource === src ? 'var(--red)' : 'var(--gray-100)',
              color: dataSource === src ? 'white' : 'var(--gray-600)',
            }}>{src === 'practice' ? 'Practice Data' : 'Game Data'}</button>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '16px', textAlign: 'center' }}>
          8U out probability × fielding quality per player
        </p>

        {ALL_POSITIONS.map(pos => {
          const basePct = Math.round((POSITION_OUT_PCT[pos] ?? 0) * 100);
          const ranked = players
            .map(p => ({ p, ...fitScore(getFieldingFor(p.id), pos) }))
            .sort((a, b) => b.score - a.score);
          const withData = ranked.filter(r => r.label !== 'no data');
          const noData   = ranked.filter(r => r.label === 'no data');

          return (
            <div key={pos} style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{pos}</span>
                <span style={{ fontSize: '11px', background: 'var(--gray-100)', borderRadius: '6px', padding: '2px 8px', color: 'var(--gray-500)', fontWeight: '700' }}>Base: {basePct}% out</span>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      {['#','Player','Fit','Inn','E','Data'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontWeight: '700', color: 'var(--gray-500)', fontSize: '11px', textTransform: 'uppercase', textAlign: h === 'Player' ? 'left' : 'center', borderBottom: '1px solid var(--gray-200)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...withData, ...noData].map(({ p, score, label, innings, errors }, i) => {
                      const pct = Math.round(score * 100);
                      const { bg, text } = scoreColor(score);
                      const isTop = i === 0 && withData.length > 0;
                      return (
                        <tr key={p.id} style={{
                          borderBottom: i < ranked.length - 1 ? '1px solid var(--gray-100)' : 'none',
                          background: isTop ? '#F0FDF4' : 'transparent',
                        }}>
                          <td style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--gray-400)', fontWeight: '700', fontSize: '12px' }}>{i + 1}</td>
                          <td style={{ padding: '7px 8px', fontWeight: '700', color: isTop ? '#16A34A' : 'inherit' }}>{getPlayerName(p)}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                            <span style={{ background: bg, color: text, borderRadius: '6px', padding: '2px 8px', fontWeight: '700', fontSize: '12px' }}>{pct}%</span>
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', color: label === 'no data' ? 'var(--gray-300)' : 'inherit' }}>{innings || '—'}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', color: label === 'no data' ? 'var(--gray-300)' : 'inherit' }}>{label === 'no data' ? '—' : errors}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontSize: '10px', color: label === 'no data' ? 'var(--gray-300)' : label === 'solid data' ? '#16A34A' : '#D97706', fontWeight: '600' }}>{label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const PracticeReviewView = () => {
    const [selectedDate, setSelectedDate] = useState(null);
    const [hitZones, setHitZones] = useState(BLANK_ZONES);
    const [loadingZones, setLoadingZones] = useState(false);

    // All practice dates across all players, newest first
    const allDates = [...new Set(
      players.flatMap(p => Object.keys(allStats[p.id]?.practiceLogs || {}))
    )].sort((a, b) => b.localeCompare(a));

    // Label for each date (from the first player that has a log entry for it)
    const dateLabels = {};
    allDates.forEach(date => {
      const p = players.find(pl => allStats[pl.id]?.practiceLogs?.[date]?.label);
      dateLabels[date] = p ? allStats[p.id].practiceLogs[date].label : date;
    });

    useEffect(() => {
      if (allDates.length === 0) { setHitZones(BLANK_ZONES); return; }
      setLoadingZones(true);
      if (selectedDate) {
        getDoc(doc(db, 'settings', 'practiceHitZones_' + selectedDate)).then(snap => {
          setHitZones(snap.exists() ? { ...BLANK_ZONES, ...snap.data() } : BLANK_ZONES);
          setLoadingZones(false);
        });
      } else {
        Promise.all(allDates.map(d => getDoc(doc(db, 'settings', 'practiceHitZones_' + d)))).then(snaps => {
          const totals = { ...BLANK_ZONES };
          snaps.forEach(snap => {
            if (!snap.exists()) return;
            Object.keys(BLANK_ZONES).forEach(k => { totals[k] = (totals[k] || 0) + (snap.data()[k] || 0); });
          });
          setHitZones(totals);
          setLoadingZones(false);
        });
      }
    }, [selectedDate, allDates.join(',')]); // eslint-disable-line

    const fmtAvg = (entry) => {
      if (!entry?.ab) return '.---';
      const hits = entry.hits ?? ((entry.singles||0)+(entry.doubles||0)+(entry.triples||0)+(entry.hr||0));
      return '.' + String(Math.round((hits / entry.ab) * 1000)).padStart(3, '0');
    };

    if (allDates.length === 0) return (
      <div className="empty-state" style={{ marginTop: '24px' }}>
        <p style={{ fontSize: '32px' }}>🏋️</p>
        <p>No practice stats yet</p>
        <p style={{ fontSize: '13px', color: 'var(--gray-400)', marginTop: '4px' }}>Tap Stats on the Practice page during practice to start logging.</p>
      </div>
    );

    const totalHits = Object.values(hitZones).reduce((s, v) => s + v, 0);
    const row0 = PRACTICE_HIT_ZONES.filter(z => z.row === 0);
    const row1 = PRACTICE_HIT_ZONES.filter(z => z.row === 1);

    // Batting rows for the selected view
    const battingRows = players
      .map(p => ({ p, entry: selectedDate ? allStats[p.id]?.practiceLogs?.[selectedDate] : allStats[p.id]?.practiceAgg }))
      .filter(({ entry }) => entry && (entry.ab > 0 || (entry.hits ?? 0) > 0));

    return (
      <div style={{ marginTop: '14px' }}>

        {/* Date selector */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button onClick={() => setSelectedDate(null)} style={{
            padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', whiteSpace: 'nowrap',
            border: `1.5px solid ${selectedDate === null ? 'var(--red)' : 'var(--gray-200)'}`,
            background: selectedDate === null ? '#FEF2F2' : 'white',
            color: selectedDate === null ? 'var(--red)' : 'var(--gray-500)',
          }}>All</button>
          {allDates.map(date => (
            <button key={date} onClick={() => setSelectedDate(date)} style={{
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', whiteSpace: 'nowrap',
              border: `1.5px solid ${selectedDate === date ? 'var(--red)' : 'var(--gray-200)'}`,
              background: selectedDate === date ? '#FEF2F2' : 'white',
              color: selectedDate === date ? 'var(--red)' : 'var(--gray-500)',
            }}>{dateLabels[date]}</button>
          ))}
        </div>

        {/* Hit Zone Grid */}
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          Hit Zones
        </div>
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--gray-500)' }}>
              {selectedDate ? (dateLabels[selectedDate] || selectedDate) : 'All Practices Combined'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{totalHits} total hits</span>
          </div>
          {loadingZones ? (
            <p style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px', padding: '12px 0' }}>Loading…</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '6px' }}>
                {row0.map(z => (
                  <div key={z.key} style={{
                    padding: '10px 4px', borderRadius: '10px', textAlign: 'center',
                    background: hitZones[z.key] > 0 ? '#FEF2F2' : 'var(--gray-100)',
                    borderBottom: hitZones[z.key] > 0 ? '3px solid var(--red)' : '3px solid transparent',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{z.label}</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: hitZones[z.key] > 0 ? 'var(--red)' : 'var(--gray-300)', lineHeight: 1 }}>{hitZones[z.key]}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {row1.map(z => (
                  <div key={z.key} style={{
                    padding: '10px 4px', borderRadius: '10px', textAlign: 'center',
                    background: hitZones[z.key] > 0 ? '#FFF7ED' : 'var(--gray-100)',
                    borderBottom: hitZones[z.key] > 0 ? '3px solid #F59E0B' : '3px solid transparent',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{z.label}</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: hitZones[z.key] > 0 ? '#D97706' : 'var(--gray-300)', lineHeight: 1 }}>{hitZones[z.key]}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Hitting table */}
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          🏏 Hitting at Practice
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                {['Player','AVG','AB','H','HR','RBI','K','BB'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', fontWeight: '700', color: 'var(--gray-500)', fontSize: '11px', textTransform: 'uppercase', textAlign: h === 'Player' ? 'left' : 'center', borderBottom: '1px solid var(--gray-200)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {battingRows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>No batting data for this practice</td></tr>
              ) : battingRows.map(({ p, entry }, i) => {
                const hits = entry.hits ?? ((entry.singles||0)+(entry.doubles||0)+(entry.triples||0)+(entry.hr||0));
                return (
                  <tr key={p.id} style={{ borderBottom: i < battingRows.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                    <td style={{ padding: '8px 6px', fontWeight: '700' }}>{getPlayerName(p)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'Oswald, sans-serif', fontWeight: '700', color: 'var(--red)' }}>{fmtAvg(entry)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{entry.ab||0}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{hits}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{entry.hr||0}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{entry.rbi||0}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{entry.k||0}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{entry.bb||0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Fielding by position */}
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          🧤 Fielding at Practice
        </div>
        {FIELDING_POSITIONS.map(pos => {
          const rows = players
            .map(p => {
              const src = selectedDate ? allStats[p.id]?.practiceLogs?.[selectedDate]?.fielding : allStats[p.id]?.practiceAgg?.fielding;
              return { p, f: src?.[pos] };
            })
            .filter(({ f }) => f && f.innings > 0)
            .sort((a, b) => (a.f.errors||0) - (b.f.errors||0));
          if (!rows.length) return null;
          return (
            <div key={pos} style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--gray-600)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: 'var(--gray-100)', borderRadius: '6px', padding: '2px 8px', fontFamily: 'Oswald, sans-serif' }}>{POS_SHORT[pos]}</span>
                {pos}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)' }}>
                      {['Player','Inn','PO','A','E'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontWeight: '700', color: 'var(--gray-500)', fontSize: '11px', textTransform: 'uppercase', textAlign: h === 'Player' ? 'left' : 'center', borderBottom: '1px solid var(--gray-200)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, f }, i) => (
                      <tr key={p.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                        <td style={{ padding: '7px 8px', fontWeight: '700' }}>{getPlayerName(p)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{f.innings||0}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{f.putouts||0}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>{f.assists||0}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', color: (f.errors||0) > 2 ? 'var(--red)' : (f.errors||0) > 0 ? '#D97706' : '#16A34A' }}>{f.errors||0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Stats" actions={canEdit && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setShowLogGame(true); setLogStep(0); setLogGame(null); setLogEntries({}); }} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
            padding: '0 12px', height: 36, color: 'white', cursor: 'pointer',
            fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'
          }}>+ Log Game</button>
          <button onClick={() => setShowNewSeasonModal(true)} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
            padding: '0 12px', height: 36, color: 'white', cursor: 'pointer',
            fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'
          }}>New Season</button>
        </div>
      )} />

      <div className="page-content">
        {!canEdit && <div className="view-only-banner">👁 Stats are updated by coaches</div>}

        {/* Team Banner */}
        <div style={{ background: 'linear-gradient(135deg, #CC1B1B, #8B0000)', borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', opacity: 0.75, textTransform: 'uppercase', marginBottom: '8px' }}>
            Team Batting — {tab === 'career' ? 'All-Time' : `${currentYear} Season`}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {[
              { label: 'AVG', value: '.' + String(Math.round(teamAvg * 1000)).padStart(3, '0') },
              { label: 'OBP', value: '.' + String(Math.round(calcOBP(activeTeam.hits||0, activeTeam.bb||0, activeTeam.ab||0) * 1000)).padStart(3,'0') },
              { label: 'H',   value: activeTeam.hits || 0 },
              { label: 'HR',  value: activeTeam.hr   || 0 },
              { label: 'RBI', value: activeTeam.rbi  || 0 },
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
          <button className={`tab ${tab === 'charts' ? 'active' : ''}`} onClick={() => setTab('charts')}>Charts</button>
          <button className={`tab ${tab === 'fielding' ? 'active' : ''}`} onClick={() => setTab('fielding')}>Fielding</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
          <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Game Log</button>
          {isCoach && <button className={`tab ${tab === 'practice' ? 'active' : ''}`} onClick={() => setTab('practice')}>Practice</button>}
          {isCoach && <button className={`tab ${tab === 'bestfit' ? 'active' : ''}`} onClick={() => setTab('bestfit')}>Best Fit</button>}
        </div>

        {tab === 'current' && <BattingTable getStats={getCurrentSeason} showEdit={true} />}
        {tab === 'career' && <BattingTable getStats={getCareer} showEdit={false} />}
        {tab === 'charts' && <ChartsView />}
        {tab === 'fielding' && <RotationView />}
        {tab === 'history' && <SeasonHistory />}
        {tab === 'log' && <GameLogView />}
        {tab === 'practice' && isCoach && <PracticeReviewView />}
        {tab === 'bestfit' && isCoach && <BestFitView />}

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
                { abbr: 'RBI', name: 'Runs Batted In',   desc: 'Number of runs scored due to the batter\'s hit.' },
                { abbr: 'R',   name: 'Runs Scored',      desc: 'Number of times the player crossed home plate and scored.' },
                { abbr: 'K',   name: 'Strikeout',         desc: 'Batter gets 3 strikes without putting the ball in play.' },
                { abbr: 'BB',  name: 'Walk',              desc: 'Pitcher throws 4 balls — batter walks to 1st base free. Counts toward OBP but not AVG.' },
                { abbr: 'OBP', name: 'On-Base %',         desc: 'How often the player gets on base any way possible: (H + BB) ÷ (AB + BB). .350+ is excellent.' },
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
                { abbr: 'Inn', name: 'Innings',        desc: 'Total innings played at that position across all games.' },
                { abbr: 'PO',  name: 'Putout',         desc: 'The player directly made the out — catching a fly ball, catching a throw at a base, or tagging a runner.' },
                { abbr: 'A',   name: 'Assist',         desc: 'The player fielded the ball and threw it to another player who made the out.' },
                { abbr: 'E',   name: 'Errors',         desc: 'Any play that should have resulted in an out but didn\'t — misplaying the ball, dropping a catch, or taking too long to throw.' },
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
                    { key: 'ab',      label: 'At Bats' },
                    { key: 'singles', label: '1B — Singles' },
                    { key: 'doubles', label: '2B — Doubles' },
                    { key: 'triples', label: '3B — Triples' },
                    { key: 'hr',      label: 'HR — Home Runs' },
                    { key: 'rbi',     label: 'RBI' },
                    { key: 'k',       label: 'K — Strikeouts' },
                    { key: 'bb',      label: 'BB — Walks' },
                    { key: 'runs',    label: 'R — Runs Scored' },
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
                {(() => {
                  const h  = (parseInt(editStats.singles)||0)+(parseInt(editStats.doubles)||0)+(parseInt(editStats.triples)||0)+(parseInt(editStats.hr)||0);
                  const ab = parseInt(editStats.ab) || 0;
                  const bb = parseInt(editStats.bb) || 0;
                  const avg = ab > 0 ? '.'+String(Math.round(h/ab*1000)).padStart(3,'0') : '.000';
                  const obp = '.'+String(Math.round(calcOBP(h,bb,ab)*1000)).padStart(3,'0');
                  return (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <div style={{ flex: 1, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '2px' }}>H (auto)</div>
                        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '26px', fontWeight: '700', color: 'var(--red)', lineHeight: 1 }}>{h}</div>
                        <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>1B+2B+3B+HR</div>
                      </div>
                      <div style={{ flex: 1, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '2px' }}>AVG (auto)</div>
                        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '26px', fontWeight: '700', color: 'var(--black)', lineHeight: 1 }}>{avg}</div>
                        <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>H ÷ AB</div>
                      </div>
                      <div style={{ flex: 1, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '2px' }}>OBP (auto)</div>
                        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '26px', fontWeight: '700', color: 'var(--blue)', lineHeight: 1 }}>{obp}</div>
                        <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>(H+BB)÷(AB+BB)</div>
                      </div>
                    </div>
                  );
                })()}
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
                    setEditFieldingStats(f[pos] || { innings: 0, putouts: 0, assists: 0, errors: 0 });
                  }}>
                    {FIELDING_POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { key: 'innings', label: 'Innings Played',    hint: 'How many innings at this spot' },
                    { key: 'putouts', label: 'Putouts (PO)',       hint: 'Outs they directly made — fly ball catch, tag, catch at base' },
                    { key: 'assists', label: 'Assists (A)',        hint: 'Threw to another player who made the out' },
                    { key: 'errors',  label: 'Errors (E)',         hint: 'Play should have been an out but wasn\'t' },
                  ].map(field => (
                    <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{field.label}</label>
                      <input className="form-input" type="number" min="0" step="1"
                        value={editFieldingStats[field.key] ?? 0}
                        onChange={e => setEditFieldingStats(s => ({ ...s, [field.key]: e.target.value }))}
                        style={{ textAlign: 'center', fontSize: '18px', fontFamily: 'Oswald, sans-serif' }} />
                      <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '3px', lineHeight: '1.3' }}>{field.hint}</div>
                    </div>
                  ))}
                </div>
                {/* Live plays-made total */}
                <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '10px', padding: '10px', textAlign: 'center', marginTop: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#16A34A', textTransform: 'uppercase', marginBottom: '2px' }}>Total Plays Made (auto)</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '26px', fontWeight: '700', color: '#16A34A', lineHeight: 1 }}>
                    {(parseInt(editFieldingStats.putouts)||0) + (parseInt(editFieldingStats.assists)||0)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#16A34A', marginTop: '2px' }}>PO + A</div>
                </div>
                <button className="btn-primary" onClick={() => saveFielding(editingPlayer)} style={{ marginTop: '16px' }}>Save Fielding Stats</button>
              </>
            )}
          </div>
        </div>
      )}

      {showLogGame && (
        <LogGameModal
          players={players}
          currentYear={currentYear}
          games={games}
          onClose={() => setShowLogGame(false)}
          onSaved={msg => setToast(msg)}
        />
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
