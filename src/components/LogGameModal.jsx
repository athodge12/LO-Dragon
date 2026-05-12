import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const FIELDING_POSITIONS = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const POS_SHORT = { 'Pitcher':'P','Catcher':'C','1st Base':'1B','2nd Base':'2B','3rd Base':'3B','Shortstop':'SS','Left Field':'LF','Left Center':'LC','Right Center':'RC','Right Field':'RF' };

const BLANK_BATTING = { ab:0, singles:0, doubles:0, triples:0, hr:0, rbi:0, k:0, bb:0, runs:0 };
const BLANK_ZONES = { lf:0, lc:0, cf:0, rc:0, rf:0, thirdBase:0, ss:0, pitcher:0, secondBase:0, firstBase:0 };
const HIT_ZONES = [
  { key: 'lf', label: 'LF', row: 0 }, { key: 'lc', label: 'LC', row: 0 },
  { key: 'cf', label: 'CF', row: 0 }, { key: 'rc', label: 'RC', row: 0 },
  { key: 'rf', label: 'RF', row: 0 }, { key: 'thirdBase', label: '3B', row: 1 },
  { key: 'ss', label: 'SS', row: 1 }, { key: 'pitcher', label: 'P', row: 1 },
  { key: 'secondBase', label: '2B', row: 1 }, { key: 'firstBase', label: '1B', row: 1 },
];

function calcOBP(hits, bb, ab) {
  const d = ab + bb;
  return d > 0 ? (hits + bb) / d : 0;
}

function recalcBattingFromLogs(allLogs, year, currentSeasons) {
  const logs = Object.values(allLogs).filter(g => g.year === year);
  if (logs.length === 0) return currentSeasons;
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
  return { ...currentSeasons, [year]: t };
}

function recalcFieldingFromLogs(allLogs) {
  const totals = {};
  Object.values(allLogs).forEach(g => {
    if (!g.fielding) return;
    Object.entries(g.fielding).forEach(([pos, f]) => {
      if (!totals[pos]) totals[pos] = { innings: 0, putouts: 0, assists: 0, errors: 0 };
      totals[pos].innings += parseInt(f.innings) || 0;
      totals[pos].putouts += parseInt(f.putouts) || 0;
      totals[pos].assists += parseInt(f.assists) || 0;
      totals[pos].errors  += parseInt(f.errors)  || 0;
    });
  });
  return totals;
}

function PlusMinus({ label, value, onInc, onDec }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <button onClick={onDec} style={{ width: 28, height: 28, borderRadius: '6px', border: '1.5px solid var(--gray-200)', background: 'white', fontSize: '16px', lineHeight: 1, cursor: 'pointer', fontWeight: '700' }}>−</button>
        <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', minWidth: '24px', textAlign: 'center' }}>{value}</span>
        <button onClick={onInc} style={{ width: 28, height: 28, borderRadius: '6px', border: 'none', background: 'var(--red)', color: 'white', fontSize: '16px', lineHeight: 1, cursor: 'pointer', fontWeight: '700' }}>+</button>
      </div>
    </div>
  );
}

function LiveScoreBanner({ liveScore, onScoreAdjust, onOutsChange, onInningChange }) {
  const canEdit = !!onScoreAdjust;
  const ScoreCol = ({ team, label, color }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color, fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      {canEdit && (
        <button onClick={() => onScoreAdjust(team, 1)} style={{ display: 'block', width: '100%', background: 'var(--gray-700)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '14px', lineHeight: '18px', cursor: 'pointer', marginBottom: '4px' }}>+</button>
      )}
      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '36px', fontWeight: '700', lineHeight: 1, color: (team === 'dragons' ? liveScore.dragons >= liveScore.them : liveScore.them > liveScore.dragons) ? '#FFD700' : 'white' }}>
        {liveScore[team]}
      </div>
      {canEdit && (
        <button onClick={() => onScoreAdjust(team, -1)} style={{ display: 'block', width: '100%', background: 'var(--gray-700)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '14px', lineHeight: '18px', cursor: 'pointer', marginTop: '4px' }}>−</button>
      )}
    </div>
  );
  return (
    <div style={{ background: '#111', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', fontFamily: 'Oswald, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: canEdit ? '12px' : '0' }}>
        <ScoreCol team="dragons" label="Dragons" color="var(--red)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--gray-500)', fontSize: '13px', marginBottom: '6px', fontWeight: '700' }}>Inn {liveScore.inning || '—'}</div>
          {canEdit ? (
            <button onClick={onOutsChange} style={{ display: 'flex', gap: '5px', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', margin: '0 auto' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < liveScore.outs ? 'var(--red)' : 'var(--gray-700)', border: `2px solid ${i < liveScore.outs ? 'var(--red)' : 'var(--gray-600)'}` }} />
              ))}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < liveScore.outs ? 'var(--red)' : 'var(--gray-700)' }} />
              ))}
            </div>
          )}
          <div style={{ fontSize: '9px', color: 'var(--gray-500)', marginTop: '4px', textTransform: 'uppercase' }}>
            {liveScore.outs} {liveScore.outs === 1 ? 'out' : 'outs'}
            {liveScore.outs === 3 && <span style={{ color: 'var(--red)' }}> ✓</span>}
          </div>
        </div>
        <ScoreCol team="them" label={liveScore.opponent?.substring(0, 6)?.toUpperCase() || 'OPP'} color="var(--gray-400)" />
      </div>
      {canEdit && onInningChange && (
        <div style={{ borderTop: '1px solid var(--gray-800)', paddingTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--gray-500)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Inning</span>
          <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
            {[1,2,3,4,5,6,7].map(i => (
              <button key={i} onClick={() => onInningChange(i)} style={{
                flex: 1, padding: '5px 0', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '13px',
                background: liveScore.inning === i ? 'var(--red)' : 'var(--gray-700)',
                color: liveScore.inning === i ? 'white' : 'var(--gray-400)',
              }}>{i}</button>
            ))}
            {liveScore.inning > 7 && (
              <button onClick={() => onInningChange(liveScore.inning)} style={{
                padding: '5px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '13px',
                background: 'var(--red)', color: 'white',
              }}>{liveScore.inning}</button>
            )}
            <button onClick={() => onInningChange(liveScore.inning > 7 ? liveScore.inning + 1 : 8)} style={{
              padding: '5px 6px', borderRadius: '6px', border: '1px dashed var(--gray-600)', cursor: 'pointer',
              fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '10px',
              background: 'transparent', color: 'var(--gray-600)',
            }}>+EI</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogGameModal({ players, currentYear, games = [], initialGame = null, liveScore = null, onScoreAdjust = null, onOutsChange = null, onInningChange = null, onClose, onSaved }) {
  const [logGame, setLogGame] = useState(initialGame);
  const [manualGame, setManualGame] = useState({ opponent: '', date: new Date().toISOString().slice(0, 10) });
  const [logEntries, setLogEntries] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [playerTab, setPlayerTab] = useState('batting');
  const [activePlayer, setActivePlayer] = useState(null);
  const [gameZones, setGameZones] = useState(BLANK_ZONES);
  const [lastZone, setLastZone] = useState(null);
  const [zonesOpen, setZonesOpen] = useState(false);

  // Load existing saved stats whenever a game is selected (so re-opening mid-game works)
  useEffect(() => {
    if (!logGame) return;
    const safeId = (logGame.id || 'manual_' + (logGame.date || Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameKey = `${currentYear}_${safeId}`;
    const load = async () => {
      const entries = {};
      await Promise.all(players.map(async (player) => {
        const snap = await getDoc(doc(db, 'playerStats', player.id));
        if (!snap.exists()) return;
        const gl = snap.data().gameLogs?.[gameKey];
        if (!gl) return;
        entries[player.id] = {
          ab: gl.ab || 0, singles: gl.singles || 0, doubles: gl.doubles || 0,
          triples: gl.triples || 0, hr: gl.hr || 0, rbi: gl.rbi || 0,
          k: gl.k || 0, bb: gl.bb || 0, runs: gl.runs || 0,
          fieldingThisGame: Object.entries(gl.fielding || {}).map(([pos, f]) => ({
            pos, innings: f.innings || 0, putouts: f.putouts || 0, assists: f.assists || 0, errors: f.errors || 0,
          })),
        };
      }));
      setLogEntries(entries);
      const zonesSnap = await getDoc(doc(db, 'settings', 'gameHitZones_' + gameKey));
      if (zonesSnap.exists()) setGameZones({ ...BLANK_ZONES, ...zonesSnap.data() });
    };
    load();
  }, [logGame?.id, logGame?.date]); // eslint-disable-line

  const getEntry = (playerId) => logEntries[playerId] || { ...BLANK_BATTING, fieldingThisGame: [] };

  const changeBat = (id, key, delta) => {
    const e = getEntry(id);
    setLogEntries(prev => ({
      ...prev,
      [id]: { ...e, [key]: Math.max(0, (parseInt(e[key]) || 0) + delta) }
    }));
  };

  const changeFielding = (id, pos, key, delta) => {
    const e = getEntry(id);
    setLogEntries(prev => ({
      ...prev,
      [id]: {
        ...e,
        fieldingThisGame: (e.fieldingThisGame || []).map(f =>
          f.pos === pos ? { ...f, [key]: Math.max(0, (f[key] || 0) + delta) } : f
        )
      }
    }));
  };

  const addFieldingPos = (id, pos) => {
    const e = getEntry(id);
    if ((e.fieldingThisGame || []).find(f => f.pos === pos)) return;
    setLogEntries(prev => ({
      ...prev,
      [id]: { ...e, fieldingThisGame: [...(e.fieldingThisGame || []), { pos, innings: 1, putouts: 0, assists: 0, errors: 0 }] }
    }));
  };

  const removeFieldingPos = (id, pos) => {
    const e = getEntry(id);
    setLogEntries(prev => ({
      ...prev,
      [id]: { ...e, fieldingThisGame: (e.fieldingThisGame || []).filter(f => f.pos !== pos) }
    }));
  };

  const tapZone = (key) => { setGameZones(z => ({ ...z, [key]: (z[key]||0)+1 })); setLastZone(key); };
  const undoZone = () => { if (!lastZone) return; setGameZones(z => ({ ...z, [lastZone]: Math.max(0,(z[lastZone]||0)-1) })); setLastZone(null); };

  const hasStats = (id) => {
    const e = logEntries[id];
    if (!e) return false;
    return e.ab > 0 || e.singles > 0 || e.doubles > 0 || e.triples > 0 || e.hr > 0 || e.rbi > 0 || e.k > 0 || e.bb > 0 || e.runs > 0 || (e.fieldingThisGame || []).length > 0;
  };

  const handleFinish = async () => {
    setIsSaving(true);
    const game = logGame;
    const year = currentYear;
    const safeId = (game.id || 'manual_' + (game.date || Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameKey = `${year}_${safeId}`;

    for (const player of players) {
      const e = getEntry(player.id);
      const singles = parseInt(e.singles) || 0;
      const doubles = parseInt(e.doubles) || 0;
      const triples = parseInt(e.triples) || 0;
      const hr      = parseInt(e.hr)      || 0;
      const ab      = parseInt(e.ab)      || 0;
      const rbi     = parseInt(e.rbi)     || 0;
      const k       = parseInt(e.k)       || 0;
      const bb      = parseInt(e.bb)      || 0;
      const runs    = parseInt(e.runs)    || 0;
      const hits    = singles + doubles + triples + hr;

      const fieldingMap = {};
      (e.fieldingThisGame || []).forEach(f => {
        fieldingMap[f.pos] = {
          innings: parseInt(f.innings) || 0,
          putouts: parseInt(f.putouts) || 0,
          assists: parseInt(f.assists) || 0,
          errors:  parseInt(f.errors)  || 0,
        };
      });

      const ref = doc(db, 'playerStats', player.id);
      const snap = await getDoc(ref);
      const current = snap.exists() ? snap.data() : {};

      const gameEntry = { gameId: safeId, date: game.date, opponent: game.opponent, year, ab, singles, doubles, triples, hr, hits, rbi, k, bb, runs };
      if (Object.keys(fieldingMap).length > 0) gameEntry.fielding = fieldingMap;

      const updatedLogs    = { ...(current.gameLogs || {}), [gameKey]: gameEntry };
      const updatedSeasons = recalcBattingFromLogs(updatedLogs, year, current.seasons || {});

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

      const logFielding    = recalcFieldingFromLogs(updatedLogs);
      const mergedFielding = { ...(current.fielding || {}), ...logFielding };

      await setDoc(ref, { ...current, gameLogs: updatedLogs, seasons: updatedSeasons, career, fielding: mergedFielding }, { merge: true });
    }

    const totalZoneHits = Object.values(gameZones).reduce((s, v) => s + v, 0);
    if (totalZoneHits > 0) {
      await setDoc(doc(db, 'settings', 'gameHitZones_' + gameKey), gameZones);
    }
    setIsSaving(false);
    onSaved(`Game vs ${game.opponent} logged for ${players.length} players!`);
    onClose();
  };

  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName||''} ${p?.lastName||''}`.trim() || 'Unknown';

  // ── Screen A: Game picker ──────────────────────────────────────────
  if (!logGame) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>
        <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Log a Game</h3>
        <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '14px' }}>Pick a game or enter manually.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {[...games].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(g => (
            <button key={g.id} onClick={() => setLogGame({ id: g.id, opponent: g.opponent || g.title || 'Game', date: g.date || '', year: currentYear })}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--gray-200)', background: 'white', cursor: 'pointer' }}>
              <div style={{ fontWeight: '700', fontSize: '14px' }}>vs {g.opponent || g.title || 'Game'}</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>{g.date || ''}</div>
            </button>
          ))}
          {games.length === 0 && <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', padding: '8px 0' }}>No scheduled games found.</p>}
        </div>
        <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '14px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gray-600)', marginBottom: '10px' }}>Or enter manually:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Opponent</label>
              <input className="form-input" placeholder="e.g. Tigers" value={manualGame.opponent} onChange={e => setManualGame(m => ({ ...m, opponent: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={manualGame.date} onChange={e => setManualGame(m => ({ ...m, date: e.target.value }))} />
            </div>
          </div>
          <button className="btn-primary" disabled={!manualGame.opponent.trim() || !manualGame.date}
            onClick={() => setLogGame({ id: 'manual_' + manualGame.date, opponent: manualGame.opponent.trim(), date: manualGame.date, year: currentYear })}>
            Use Manual Entry
          </button>
        </div>
      </div>
    </div>
  );

  // ── Screen C: Player detail ────────────────────────────────────────
  if (activePlayer) {
    const currentEntry = getEntry(activePlayer);
    const liveH   = (currentEntry.singles||0)+(currentEntry.doubles||0)+(currentEntry.triples||0)+(currentEntry.hr||0);
    const liveAB  = parseInt(currentEntry.ab) || 0;
    const liveBB  = parseInt(currentEntry.bb) || 0;
    const liveAVG = liveAB > 0 ? '.' + String(Math.round(liveH/liveAB*1000)).padStart(3,'0') : '.000';
    const liveOBP = '.' + String(Math.round(calcOBP(liveH, liveBB, liveAB)*1000)).padStart(3,'0');
    const currentPlayerObj = players.find(p => p.id === activePlayer);

    return (
      <div className="modal-overlay">
        <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="modal-handle" />
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
            <button onClick={() => { setActivePlayer(null); setPlayerTab('batting'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>←</button>
          </div>

          {/* Header */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              vs {logGame.opponent} &middot; {logGame.date}
            </div>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '700', textTransform: 'uppercase' }}>
              {getPlayerName(currentPlayerObj)}
              {currentPlayerObj?.jerseyNumber && <span style={{ fontSize: '14px', color: 'var(--gray-400)', marginLeft: '6px' }}>#{currentPlayerObj.jerseyNumber}</span>}
            </div>
          </div>

          {/* Live score banner */}
          {liveScore && <LiveScoreBanner liveScore={liveScore} onScoreAdjust={onScoreAdjust} onOutsChange={onOutsChange} onInningChange={onInningChange} />}

          {/* Batting / Fielding tabs */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            {['batting', 'fielding'].map(t => (
              <button key={t} onClick={() => setPlayerTab(t)} style={{
                flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer',
                border: 'none', fontWeight: '700', fontSize: '13px', textTransform: 'capitalize',
                background: playerTab === t ? 'var(--red)' : 'var(--gray-100)',
                color: playerTab === t ? 'white' : 'var(--gray-600)',
              }}>{t === 'batting' ? '⚾ Batting' : '🧤 Fielding'}</button>
            ))}
          </div>

          {/* Batting PlusMinus */}
          {playerTab === 'batting' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                {[
                  { key: 'ab',      label: 'AB' },
                  { key: 'singles', label: '1B' },
                  { key: 'doubles', label: '2B' },
                  { key: 'triples', label: '3B' },
                  { key: 'hr',      label: 'HR' },
                  { key: 'rbi',     label: 'RBI' },
                  { key: 'runs',    label: 'R' },
                  { key: 'k',       label: 'K' },
                  { key: 'bb',      label: 'BB' },
                ].map(f => (
                  <PlusMinus key={f.key} label={f.label}
                    value={currentEntry[f.key] || 0}
                    onInc={() => changeBat(activePlayer, f.key, 1)}
                    onDec={() => changeBat(activePlayer, f.key, -1)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                {[
                  { label: 'H (auto)', value: liveH,   bg: '#FEF2F2', border: '#FECACA', color: 'var(--red)' },
                  { label: 'AVG',      value: liveAVG, bg: 'var(--gray-50)', border: 'var(--gray-200)', color: 'var(--black)' },
                  { label: 'OBP',      value: liveOBP, bg: '#EFF6FF', border: '#BFDBFE', color: 'var(--blue)' },
                ].map(b => (
                  <div key={b.label} style={{ flex: 1, background: b.bg, border: `1px solid ${b.border}`, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{b.label}</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: b.color }}>{b.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Fielding PlusMinus */}
          {playerTab === 'fielding' && (
            <div style={{ marginBottom: '14px' }}>
              {(currentEntry.fieldingThisGame || []).length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', marginBottom: '10px' }}>No positions yet — tap one below</p>
              )}
              {(currentEntry.fieldingThisGame || []).map(f => (
                <div key={f.pos} style={{ background: 'var(--gray-50)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', fontFamily: 'Oswald, sans-serif' }}>{POS_SHORT[f.pos]} — {f.pos}</span>
                    <button onClick={() => removeFieldingPos(activePlayer, f.pos)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[{key:'innings',label:'Inn'},{key:'putouts',label:'PO'},{key:'assists',label:'A'},{key:'errors',label:'E'}].map(({ key, label }) => (
                      <PlusMinus key={key} label={label}
                        value={f[key] || 0}
                        onInc={() => changeFielding(activePlayer, f.pos, key, 1)}
                        onDec={() => changeFielding(activePlayer, f.pos, key, -1)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                {FIELDING_POSITIONS.filter(p => !(currentEntry.fieldingThisGame || []).find(f => f.pos === p)).map(pos => (
                  <button key={pos} onClick={() => addFieldingPos(activePlayer, pos)} style={{
                    fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '16px',
                    border: '1.5px dashed var(--gray-300)', background: 'white', color: 'var(--gray-500)', cursor: 'pointer'
                  }}>+ {POS_SHORT[pos]}</button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { setActivePlayer(null); setPlayerTab('batting'); }} style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            border: '1.5px solid var(--gray-200)', background: 'white',
            fontWeight: '700', fontSize: '14px', cursor: 'pointer'
          }}>← Back to Roster</button>
        </div>
      </div>
    );
  }

  // ── Screen B: Player grid ──────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Game Stats
          </div>
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '700', textTransform: 'uppercase' }}>
            vs {logGame.opponent} &middot; {logGame.date}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
            Tap a player to enter their stats
          </div>
        </div>

        {/* Live score banner */}
        {liveScore && <LiveScoreBanner liveScore={liveScore} onScoreAdjust={onScoreAdjust} onOutsChange={onOutsChange} onInningChange={onInningChange} />}

        {/* Player grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {players.map(p => {
            const logged = hasStats(p.id);
            return (
              <button key={p.id} onClick={() => { setActivePlayer(p.id); setPlayerTab('batting'); }}
                style={{
                  padding: '10px 6px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                  border: `2px solid ${logged ? '#16A34A' : 'var(--gray-200)'}`,
                  background: logged ? '#DCFCE7' : 'white', position: 'relative'
                }}>
                {logged && <div style={{ position: 'absolute', top: 4, right: 6, fontSize: '12px', color: '#16A34A', fontWeight: '700' }}>✓</div>}
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '700', color: logged ? '#16A34A' : 'var(--black)', lineHeight: '1.2' }}>
                  {getPlayerName(p)}
                </div>
                {p.jerseyNumber && <div style={{ fontSize: '10px', color: logged ? '#16A34A' : 'var(--gray-400)', marginTop: '2px' }}>#{p.jerseyNumber}</div>}
              </button>
            );
          })}
        </div>

        {/* Hit Zones collapsible */}
        <div style={{ marginBottom: '12px', border: '1px solid var(--gray-200)', borderRadius: '12px', overflow: 'hidden' }}>
          <button onClick={() => setZonesOpen(o => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--gray-50)', border: 'none', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚾ Hit Zones ({Object.values(gameZones).reduce((s,v)=>s+v,0)} hits)
            </span>
            <span style={{ fontSize: '18px', color: 'var(--gray-400)' }}>{zonesOpen ? '▲' : '▼'}</span>
          </button>
          {zonesOpen && (
            <div style={{ padding: '12px' }}>
              {[0,1].map(row => (
                <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: row===0?'6px':0 }}>
                  {HIT_ZONES.filter(z=>z.row===row).map(z => (
                    <button key={z.key} onClick={() => tapZone(z.key)} style={{ padding: '10px 4px', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', border: 'none', background: gameZones[z.key]>0 ? (row===0?'#FEF2F2':'#FFF7ED') : 'var(--gray-100)', borderBottom: `3px solid ${gameZones[z.key]>0?(row===0?'var(--red)':'#F59E0B'):'transparent'}` }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{z.label}</div>
                      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: gameZones[z.key]>0?(row===0?'var(--red)':'#D97706'):'var(--gray-300)', lineHeight:1 }}>{gameZones[z.key]}</div>
                    </button>
                  ))}
                </div>
              ))}
              {lastZone && (
                <button onClick={undoZone} style={{ marginTop: '10px', width: '100%', padding: '8px', borderRadius: '8px', border: '1.5px solid var(--gray-300)', background: 'white', color: 'var(--gray-600)', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                  ↩ Undo last tap ({HIT_ZONES.find(z=>z.key===lastZone)?.label})
                </button>
              )}
            </div>
          )}
        </div>

        <button disabled={isSaving} onClick={handleFinish} style={{
          width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
          background: 'var(--red)', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer'
        }}>
          {isSaving ? 'Saving...' : `Save Game Log (${Object.keys(logEntries).filter(id => hasStats(id)).length} players logged)`}
        </button>
      </div>
    </div>
  );
}
