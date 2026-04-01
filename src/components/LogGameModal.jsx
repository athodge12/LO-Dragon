import { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const FIELDING_POSITIONS = ['Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const POS_SHORT = { 'Catcher':'C','1st Base':'1B','2nd Base':'2B','3rd Base':'3B','Shortstop':'SS','Left Field':'LF','Left Center':'LC','Right Center':'RC','Right Field':'RF' };

const BLANK_BATTING = { ab:0, singles:0, doubles:0, triples:0, hr:0, rbi:0, k:0, bb:0, runs:0 };

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
      totals[pos].innings  += parseInt(f.innings)  || 0;
      totals[pos].putouts  += parseInt(f.putouts)  || 0;
      totals[pos].assists  += parseInt(f.assists)  || 0;
      totals[pos].errors   += parseInt(f.errors)   || 0;
    });
  });
  return totals;
}

// --- Sub-component: fielding entry list for one player during log ---
function FieldingEntries({ entries = [], onAdd, onUpdate, onRemove }) {
  const [addPos, setAddPos] = useState('');
  const used = entries.map(e => e.pos);
  const available = FIELDING_POSITIONS.filter(p => !used.includes(p));

  return (
    <div>
      {entries.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '8px', textAlign: 'center' }}>No positions logged yet — add below.</p>
      )}
      {entries.map(entry => (
        <div key={entry.pos} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '13px', fontFamily: 'Oswald, sans-serif' }}>{POS_SHORT[entry.pos]} — {entry.pos}</span>
            <button onClick={() => onRemove(entry.pos)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {[
              { key: 'innings', label: 'Inn' },
              { key: 'putouts', label: 'PO' },
              { key: 'assists', label: 'A' },
              { key: 'errors',  label: 'E' },
            ].map(f => (
              <div key={f.key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '3px' }}>{f.label}</div>
                <input
                  type="number" min="0" step="1"
                  value={entry[f.key] ?? 0}
                  onChange={e => onUpdate(entry.pos, f.key, e.target.value)}
                  style={{ width: '100%', textAlign: 'center', fontSize: '18px', fontFamily: 'Oswald, sans-serif', fontWeight: '700', border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '6px 2px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {available.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
          {available.map(pos => (
            <button key={pos} onClick={() => onAdd(pos)} style={{
              fontSize: '11px', fontWeight: '700', padding: '4px 10px',
              borderRadius: '16px', border: '1.5px dashed var(--gray-300)',
              background: 'white', color: 'var(--gray-500)', cursor: 'pointer'
            }}>+ {POS_SHORT[pos]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Main export
// liveMode = true when initialGame is provided (LiveScoring):
//   step 0 = player grid, step 1 = editing selected player, return to grid after save
// liveMode = false (Stats page):
//   step 0 = game picker, step 1..N = linear step through all players
// ----------------------------------------------------------------
export default function LogGameModal({ players, currentYear, games = [], initialGame = null, onClose, onSaved }) {
  const liveMode = !!initialGame;
  const [logStep, setLogStep] = useState(liveMode ? 0 : 0); // 0 = grid/picker, 1 = player entry
  const [logGame, setLogGame] = useState(initialGame);
  const [manualGame, setManualGame] = useState({ opponent: '', date: new Date().toISOString().slice(0, 10) });
  const [logEntries, setLogEntries] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [playerTab, setPlayerTab] = useState('batting');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null); // liveMode only

  // In liveMode: currentPlayer is whoever was tapped on the grid
  // In stepMode: currentPlayer is players[logStep - 1]
  const currentPlayer = liveMode
    ? (selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null)
    : (logStep >= 1 ? players[logStep - 1] : null);

  const getEntry = (playerId) => logEntries[playerId] || { ...BLANK_BATTING, fieldingThisGame: [] };

  const setField = (key, val) => {
    if (!currentPlayer) return;
    setLogEntries(prev => ({ ...prev, [currentPlayer.id]: { ...getEntry(currentPlayer.id), [key]: val } }));
  };

  const addFieldingPos = (pos) => {
    if (!currentPlayer) return;
    const e = getEntry(currentPlayer.id);
    if ((e.fieldingThisGame || []).find(f => f.pos === pos)) return;
    setLogEntries(prev => ({
      ...prev,
      [currentPlayer.id]: { ...e, fieldingThisGame: [...(e.fieldingThisGame || []), { pos, innings: 1, putouts: 0, assists: 0, errors: 0 }] }
    }));
  };

  const updateFieldingEntry = (pos, key, val) => {
    if (!currentPlayer) return;
    const e = getEntry(currentPlayer.id);
    setLogEntries(prev => ({
      ...prev,
      [currentPlayer.id]: { ...e, fieldingThisGame: (e.fieldingThisGame || []).map(f => f.pos === pos ? { ...f, [key]: val } : f) }
    }));
  };

  const removeFieldingPos = (pos) => {
    if (!currentPlayer) return;
    const e = getEntry(currentPlayer.id);
    setLogEntries(prev => ({
      ...prev,
      [currentPlayer.id]: { ...e, fieldingThisGame: (e.fieldingThisGame || []).filter(f => f.pos !== pos) }
    }));
  };

  const hasStats = (id) => {
    const e = logEntries[id];
    if (!e) return false;
    return e.ab > 0 || e.singles > 0 || e.doubles > 0 || e.triples > 0 || e.hr > 0 || e.rbi > 0 || e.k > 0 || e.bb > 0 || e.runs > 0 || (e.fieldingThisGame || []).length > 0;
  };

  const advance = () => {
    if (liveMode) {
      // Return to player grid after entering one player's stats
      setSelectedPlayerId(null);
      setLogStep(0);
      setPlayerTab('batting');
    } else if (logStep < players.length) {
      setLogStep(s => s + 1);
      setPlayerTab('batting');
    } else {
      handleFinish();
    }
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

    setIsSaving(false);
    onSaved(`Game vs ${game.opponent} logged for ${players.length} players!`);
    onClose();
  };

  const currentEntry = currentPlayer ? getEntry(currentPlayer.id) : {};
  const liveH   = (parseInt(currentEntry.singles)||0)+(parseInt(currentEntry.doubles)||0)+(parseInt(currentEntry.triples)||0)+(parseInt(currentEntry.hr)||0);
  const liveAB  = parseInt(currentEntry.ab) || 0;
  const liveBB  = parseInt(currentEntry.bb) || 0;
  const liveAVG = liveAB > 0 ? '.' + String(Math.round(liveH/liveAB*1000)).padStart(3,'0') : '.000';
  const liveOBP = '.' + String(Math.round(calcOBP(liveH, liveBB, liveAB)*1000)).padStart(3,'0');

  const getPlayerName = (p) => p?.name || p?.childName || `${p?.firstName||''} ${p?.lastName||''}`.trim() || 'Unknown';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-handle" />

        {/* ── Live mode: Player grid ── */}
        {liveMode && logStep === 0 && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Live Stats
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '700', textTransform: 'uppercase' }}>
                vs {logGame?.opponent} &middot; {logGame?.date}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                Tap a player to enter their stats
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {players.map(p => {
                const logged = hasStats(p.id);
                return (
                  <button key={p.id} onClick={() => { setSelectedPlayerId(p.id); setLogStep(1); setPlayerTab('batting'); }}
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
            <button disabled={isSaving} onClick={handleFinish} style={{
              width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
              background: 'var(--red)', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer'
            }}>
              {isSaving ? 'Saving...' : `Save Game Log (${Object.keys(logEntries).filter(id => hasStats(id)).length} players logged)`}
            </button>
          </>
        )}

        {/* ── Step 0: Pick game (step-through mode only) ── */}
        {!liveMode && logStep === 0 && (
          <>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Log a Game</h3>
            <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginBottom: '14px' }}>Pick a game or enter manually.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {games.slice(0, 10).map(g => (
                <button key={g.id} onClick={() => { setLogGame({ id: g.id, opponent: g.opponent || g.title || 'Game', date: g.date || '', year: currentYear }); setLogStep(1); }}
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
                onClick={() => { setLogGame({ id: 'manual_' + manualGame.date, opponent: manualGame.opponent.trim(), date: manualGame.date, year: currentYear }); setLogStep(1); }}>
                Use Manual Entry
              </button>
            </div>
          </>
        )}

        {/* ── Per-player stats entry ── */}
        {logStep >= 1 && currentPlayer && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  vs {logGame?.opponent} &middot; {logGame?.date}
                </div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '700', textTransform: 'uppercase' }}>
                  {getPlayerName(currentPlayer)}
                  {currentPlayer.jerseyNumber && <span style={{ fontSize: '14px', color: 'var(--gray-400)', marginLeft: '6px' }}>#{currentPlayer.jerseyNumber}</span>}
                </div>
              </div>
              {!liveMode && (
                <div style={{ fontSize: '12px', color: 'var(--gray-400)', textAlign: 'right', paddingTop: '4px' }}>
                  {logStep} of {players.length}
                </div>
              )}
            </div>

            {/* Progress bar (step-through mode only) */}
            {!liveMode && (
              <div style={{ height: '4px', background: 'var(--gray-100)', borderRadius: '2px', marginBottom: '14px' }}>
                <div style={{ height: '100%', width: `${(logStep / players.length) * 100}%`, background: 'var(--red)', borderRadius: '2px', transition: 'width 0.2s' }} />
              </div>
            )}

            {/* Batting / Fielding tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {['batting', 'fielding'].map(t => (
                <button key={t} onClick={() => setPlayerTab(t)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${playerTab === t ? 'var(--red)' : 'var(--gray-200)'}`,
                  background: playerTab === t ? '#FEF2F2' : 'white',
                  color: playerTab === t ? 'var(--red)' : 'var(--gray-600)',
                  fontWeight: '700', fontSize: '13px', textTransform: 'uppercase'
                }}>{t === 'batting' ? '⚾ Batting' : '🧤 Fielding'}</button>
              ))}
            </div>

            {/* Batting inputs */}
            {playerTab === 'batting' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
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
                    <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{f.label}</label>
                      <input className="form-input" type="number" min="0" step="1"
                        value={currentEntry[f.key] ?? 0}
                        onChange={e => setField(f.key, e.target.value)}
                        style={{ textAlign: 'center', fontSize: '22px', fontFamily: 'Oswald, sans-serif', padding: '8px 4px' }} />
                    </div>
                  ))}
                </div>
                {/* Live auto-calc */}
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

            {/* Fielding inputs */}
            {playerTab === 'fielding' && (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '10px', lineHeight: '1.5' }}>
                  Tap a position below to add it, then fill in innings, putouts, assists, and errors.
                </p>
                <FieldingEntries
                  entries={currentEntry.fieldingThisGame || []}
                  onAdd={addFieldingPos}
                  onUpdate={updateFieldingEntry}
                  onRemove={removeFieldingPos}
                />
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {!liveMode && (
                <button onClick={advance} style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  border: '1px solid var(--gray-200)', background: 'white',
                  cursor: 'pointer', fontWeight: '600', fontSize: '14px'
                }}>Skip (zeros)</button>
              )}
              <button disabled={isSaving} onClick={advance} style={{
                flex: 2, padding: '12px', borderRadius: '10px', border: 'none',
                background: 'var(--red)', color: 'white', cursor: 'pointer',
                fontWeight: '700', fontSize: '14px'
              }}>
                {isSaving ? 'Saving...' :
                  liveMode ? '← Back to Roster' :
                  logStep < players.length ? 'Save & Next →' : 'Finish & Save All'}
              </button>
            </div>
            {!liveMode && logStep > 1 && (
              <button onClick={() => { setLogStep(s => s - 1); setPlayerTab('batting'); }}
                style={{ marginTop: '8px', width: '100%', background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '13px' }}>
                ← Back
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
