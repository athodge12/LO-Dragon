import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const FIELDING_POSITIONS = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];
const POS_SHORT = { 'Pitcher':'P','Catcher':'C','1st Base':'1B','2nd Base':'2B','3rd Base':'3B','Shortstop':'SS','Left Field':'LF','Left Center':'LC','Right Center':'RC','Right Field':'RF' };

const HIT_ZONES = [
  { key: 'lf',         label: 'LF',   row: 0, col: 0 },
  { key: 'lc',         label: 'LC',   row: 0, col: 1 },
  { key: 'cf',         label: 'CF',   row: 0, col: 2 },
  { key: 'rc',         label: 'RC',   row: 0, col: 3 },
  { key: 'rf',         label: 'RF',   row: 0, col: 4 },
  { key: 'thirdBase',  label: '3B',   row: 1, col: 0 },
  { key: 'ss',         label: 'SS',   row: 1, col: 1 },
  { key: 'pitcher',    label: 'P',    row: 1, col: 2 },
  { key: 'secondBase', label: '2B',   row: 1, col: 3 },
  { key: 'firstBase',  label: '1B',   row: 1, col: 4 },
];

const BLANK_BATTING = { ab: 0, singles: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, k: 0, bb: 0, runs: 0 };
const BLANK_ZONES   = { lf: 0, lc: 0, cf: 0, rc: 0, rf: 0, thirdBase: 0, ss: 0, pitcher: 0, secondBase: 0, firstBase: 0 };

function calcAvg(e) {
  const hits = (e.singles||0)+(e.doubles||0)+(e.triples||0)+(e.hr||0);
  return e.ab > 0 ? '.' + String(Math.round(hits / e.ab * 1000)).padStart(3,'0') : '.---';
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

export default function LogPracticeModal({ players, practiceSchedule = [], onClose, onSaved }) {
  const [step, setStep] = useState('pick');        // 'pick' | 'main'
  const [practiceDate, setPracticeDate] = useState('');
  const [practiceLabel, setPracticeLabel] = useState('Practice');
  const [hitZones, setHitZones] = useState(BLANK_ZONES);
  const [entries, setEntries] = useState({});       // { playerId: { batting, fieldingList, saved } }
  const [activePlayer, setActivePlayer] = useState(null);
  const [fieldTab, setFieldTab] = useState('batting');
  const [isSaving, setIsSaving] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0,10));

  // Load existing hit zones when date is chosen
  useEffect(() => {
    if (!practiceDate) return;
    const unsub = onSnapshot(doc(db, 'settings', 'practiceHitZones_' + practiceDate), snap => {
      if (snap.exists()) setHitZones({ ...BLANK_ZONES, ...snap.data() });
      else setHitZones(BLANK_ZONES);
    });
    return () => unsub();
  }, [practiceDate]);

  // Load already-saved practice entries for today
  useEffect(() => {
    if (!practiceDate || !players.length) return;
    players.forEach(async p => {
      const snap = await getDoc(doc(db, 'playerStats', p.id));
      if (snap.exists()) {
        const log = snap.data().practiceLogs?.[practiceDate];
        if (log) {
          const fieldingList = Object.entries(log.fielding || {}).map(([pos, f]) => ({ pos, ...f }));
          setEntries(prev => ({
            ...prev,
            [p.id]: { batting: { ...BLANK_BATTING, ...log }, fieldingList, saved: true }
          }));
        }
      }
    });
  }, [practiceDate, players]);

  const getEntry = id => entries[id] || { batting: { ...BLANK_BATTING }, fieldingList: [], saved: false };

  const setBat = (id, key, delta) => {
    const e = getEntry(id);
    const val = Math.max(0, (e.batting[key] || 0) + delta);
    const isHit = ['singles', 'doubles', 'triples', 'hr', 'k'].includes(key);
    const abDelta = isHit ? delta : 0;
    const newAb = Math.max(0, (e.batting.ab || 0) + abDelta);
    setEntries(prev => ({ ...prev, [id]: { ...e, batting: { ...e.batting, [key]: val, ...(isHit ? { ab: newAb } : {}) }, saved: false } }));
  };

  const addPos = (id, pos) => {
    const e = getEntry(id);
    if (e.fieldingList.find(f => f.pos === pos)) return;
    const blank = pos === 'Pitcher'
      ? { pos, innings: 0, k: 0, bb: 0, hitsAllowed: 0, er: 0, errors: 0 }
      : { pos, innings: 0, putouts: 0, assists: 0, errors: 0 };
    setEntries(prev => ({ ...prev, [id]: { ...e, fieldingList: [...e.fieldingList, blank], saved: false } }));
  };

  const updatePos = (id, pos, key, delta) => {
    const e = getEntry(id);
    setEntries(prev => ({
      ...prev,
      [id]: { ...e, fieldingList: e.fieldingList.map(f => f.pos === pos ? { ...f, [key]: Math.max(0, (f[key]||0) + delta) } : f), saved: false }
    }));
  };

  const removePos = (id, pos) => {
    const e = getEntry(id);
    setEntries(prev => ({ ...prev, [id]: { ...e, fieldingList: e.fieldingList.filter(f => f.pos !== pos), saved: false } }));
  };

  const tapZone = async (key) => {
    const updated = { ...hitZones, [key]: (hitZones[key] || 0) + 1 };
    setHitZones(updated);
    await setDoc(doc(db, 'settings', 'practiceHitZones_' + practiceDate), updated);
  };

  const undoZone = async (e, key) => {
    e.stopPropagation();
    const updated = { ...hitZones, [key]: Math.max(0, (hitZones[key] || 0) - 1) };
    setHitZones(updated);
    await setDoc(doc(db, 'settings', 'practiceHitZones_' + practiceDate), updated);
  };

  const savePlayer = async (id) => {
    setIsSaving(true);
    const e = getEntry(id);
    const b = e.batting;
    const hits = (b.singles||0)+(b.doubles||0)+(b.triples||0)+(b.hr||0);
    const fieldingMap = {};
    e.fieldingList.forEach(f => {
      fieldingMap[f.pos] = { innings: f.innings||0, putouts: f.putouts||0, assists: f.assists||0, errors: f.errors||0 };
    });

    const ref = doc(db, 'playerStats', id);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};

    const logEntry = { date: practiceDate, label: practiceLabel, ...b, hits };
    if (Object.keys(fieldingMap).length) logEntry.fielding = fieldingMap;

    const updatedLogs = { ...(current.practiceLogs || {}), [practiceDate]: logEntry };

    // Recalc practiceAgg batting
    const allLogs = Object.values(updatedLogs);
    const aggBat = allLogs.reduce((acc, l) => ({
      ab:      (acc.ab||0)      + (l.ab||0),
      singles: (acc.singles||0) + (l.singles||0),
      doubles: (acc.doubles||0) + (l.doubles||0),
      triples: (acc.triples||0) + (l.triples||0),
      hr:      (acc.hr||0)      + (l.hr||0),
      hits:    (acc.hits||0)    + (l.hits||0),
      rbi:     (acc.rbi||0)     + (l.rbi||0),
      k:       (acc.k||0)       + (l.k||0),
      bb:      (acc.bb||0)      + (l.bb||0),
      runs:    (acc.runs||0)    + (l.runs||0),
    }), {});
    aggBat.avg = aggBat.ab > 0 ? aggBat.hits / aggBat.ab : 0;
    aggBat.obp = (aggBat.ab + (aggBat.bb||0)) > 0 ? ((aggBat.hits||0) + (aggBat.bb||0)) / (aggBat.ab + (aggBat.bb||0)) : 0;

    // Recalc practiceAgg fielding
    const aggField = {};
    allLogs.forEach(l => {
      Object.entries(l.fielding || {}).forEach(([pos, f]) => {
        if (!aggField[pos]) aggField[pos] = { innings: 0, putouts: 0, assists: 0, errors: 0 };
        aggField[pos].innings  += f.innings  || 0;
        aggField[pos].putouts  += f.putouts  || 0;
        aggField[pos].assists  += f.assists  || 0;
        aggField[pos].errors   += f.errors   || 0;
      });
    });

    await setDoc(ref, {
      ...current,
      practiceLogs: updatedLogs,
      practiceAgg: { ...aggBat, fielding: aggField },
    }, { merge: true });

    setEntries(prev => ({ ...prev, [id]: { ...e, saved: true } }));
    setActivePlayer(null);
    setIsSaving(false);
  };

  const getPlayerName = p => p?.name || p?.childName || `${p?.firstName||''} ${p?.lastName||''}`.trim() || 'Player';
  const getFirstName  = p => (p?.name || p?.childName || p?.firstName || '').split(' ')[0] || 'Player';

  const upcomingPractices = practiceSchedule
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.type === 'onetime' ? !!slot.date : !!slot.day)
    .map(({ slot, i }) => {
      let date = '';
      if (slot.type === 'onetime') {
        date = slot.date;
      } else {
        const DAY_MAP = { Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6 };
        const target = DAY_MAP[slot.day];
        const d = new Date(); d.setHours(0,0,0,0);
        const diff = (target - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + diff);
        date = d.toISOString().split('T')[0];
      }
      return { date, label: slot.focus ? `${slot.day || slot.date} — ${slot.focus}` : (slot.day || slot.date || 'Practice') };
    });

  // ── Step: pick practice ──────────────────────────────────────────
  if (step === 'pick') return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>Log Practice Stats</h3>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '14px' }}>Pick today's practice to start logging.</p>

        {upcomingPractices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {upcomingPractices.map(({ date, label }) => (
              <button key={date} onClick={() => { setPracticeDate(date); setPracticeLabel(label); setStep('main'); }}
                style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '12px', border: '2px solid var(--gray-200)', background: 'white', cursor: 'pointer' }}>
                <div style={{ fontWeight: '700', fontSize: '15px' }}>{label}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>{date}</div>
              </button>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '14px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gray-600)', marginBottom: '8px' }}>Or pick a date:</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1.5px solid var(--gray-200)', fontSize: '14px' }} />
            <button onClick={() => { setPracticeDate(manualDate); setPracticeLabel('Practice'); setStep('main'); }}
              style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--red)', color: 'white', fontWeight: '700', cursor: 'pointer' }}>Go</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Main practice dashboard ──────────────────────────────────────
  const active = activePlayer ? getEntry(activePlayer) : null;
  const maxZone = Math.max(1, ...Object.values(hitZones));
  const totalHits = Object.values(hitZones).reduce((s, v) => s + v, 0);
  const row0 = HIT_ZONES.filter(z => z.row === 0);
  const row1 = HIT_ZONES.filter(z => z.row === 1);

  return (
    <div className="modal-overlay" onClick={!activePlayer ? onClose : undefined}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh', overflowY: 'auto', paddingBottom: '24px' }}>
        <div className="modal-handle" />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: '600', textTransform: 'uppercase' }}>Practice Stats</div>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', fontWeight: '700' }}>{practiceLabel}</div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{practiceDate}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--gray-100)', border: 'none', borderRadius: '8px', padding: '6px 12px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>Done</button>
        </div>

        {/* ── HIT ZONE COUNTER ── */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Hit Zone Counter</span>
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{totalHits} total hits</span>
          </div>
          {/* Outfield row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '6px' }}>
            {row0.map(z => (
              <div key={z.key} style={{ position: 'relative' }}>
                <button onClick={() => tapZone(z.key)} style={{
                  width: '100%', padding: '10px 4px', borderRadius: '10px', border: 'none', cursor: 'pointer', textAlign: 'center',
                  background: hitZones[z.key] > 0 ? '#FEF2F2' : 'var(--gray-100)',
                  borderBottom: hitZones[z.key] > 0 ? `3px solid var(--red)` : '3px solid transparent',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{z.label}</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: hitZones[z.key] > 0 ? 'var(--red)' : 'var(--gray-300)', lineHeight: 1 }}>{hitZones[z.key]}</div>
                </button>
                {hitZones[z.key] > 0 && (
                  <button onClick={e => undoZone(e, z.key)} style={{
                    position: 'absolute', bottom: 5, left: 4, width: 18, height: 18,
                    borderRadius: '4px', border: 'none', background: 'rgba(220,38,38,0.15)',
                    color: 'var(--red)', fontSize: '13px', lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', padding: 0,
                  }}>−</button>
                )}
              </div>
            ))}
          </div>
          {/* Infield row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {row1.map(z => (
              <div key={z.key} style={{ position: 'relative' }}>
                <button onClick={() => tapZone(z.key)} style={{
                  width: '100%', padding: '10px 4px', borderRadius: '10px', border: 'none', cursor: 'pointer', textAlign: 'center',
                  background: hitZones[z.key] > 0 ? '#FFF7ED' : 'var(--gray-100)',
                  borderBottom: hitZones[z.key] > 0 ? '3px solid #F59E0B' : '3px solid transparent',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase' }}>{z.label}</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: hitZones[z.key] > 0 ? '#D97706' : 'var(--gray-300)', lineHeight: 1 }}>{hitZones[z.key]}</div>
                </button>
                {hitZones[z.key] > 0 && (
                  <button onClick={e => undoZone(e, z.key)} style={{
                    position: 'absolute', bottom: 5, left: 4, width: 18, height: 18,
                    borderRadius: '4px', border: 'none', background: 'rgba(217,119,6,0.15)',
                    color: '#D97706', fontSize: '13px', lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', padding: 0,
                  }}>−</button>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px', textAlign: 'center' }}>Tap zone to add · tap − to remove · auto-saves</p>
        </div>

        <div style={{ height: '1px', background: 'var(--gray-200)', marginBottom: '16px' }} />

        {/* ── PLAYER STATS GRID ── */}
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '10px' }}>
          Player Stats
        </div>

        {activePlayer ? (
          /* ── Player entry panel ── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '700', fontSize: '16px' }}>{getPlayerName(players.find(p => p.id === activePlayer))}</span>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', color: 'var(--red)', fontWeight: '700' }}>{calcAvg(active.batting)}</span>
            </div>

            {/* Tab selector */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {['batting', 'fielding'].map(t => (
                <button key={t} onClick={() => setFieldTab(t)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '13px', textTransform: 'capitalize',
                  background: fieldTab === t ? 'var(--red)' : 'var(--gray-100)',
                  color: fieldTab === t ? 'white' : 'var(--gray-600)',
                }}>{t}</button>
              ))}
            </div>

            {fieldTab === 'batting' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
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
                ].map(({ key, label }) => (
                  <PlusMinus key={key} label={label}
                    value={active.batting[key] || 0}
                    onInc={() => setBat(activePlayer, key, 1)}
                    onDec={() => setBat(activePlayer, key, -1)}
                  />
                ))}
              </div>
            )}

            {fieldTab === 'fielding' && (
              <div style={{ marginBottom: '14px' }}>
                {active.fieldingList.length === 0 && (
                  <p style={{ fontSize: '13px', color: 'var(--gray-400)', textAlign: 'center', marginBottom: '10px' }}>No positions yet — tap one below</p>
                )}
                {active.fieldingList.map(f => (
                  <div key={f.pos} style={{ background: 'var(--gray-50)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '700', fontSize: '13px' }}>{POS_SHORT[f.pos]} — {f.pos}</span>
                      <button onClick={() => removePos(activePlayer, f.pos)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--gray-300)' }}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: f.pos === 'Pitcher' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '6px' }}>
                      {(f.pos === 'Pitcher'
                        ? [{key:'innings',label:'IP'},{key:'k',label:'K'},{key:'bb',label:'BB'},{key:'hitsAllowed',label:'H'},{key:'er',label:'ER'}]
                        : [{key:'innings',label:'Inn'},{key:'putouts',label:'PO'},{key:'assists',label:'A'},{key:'errors',label:'E'}]
                      ).map(({ key, label }) => (
                        <PlusMinus key={key} label={label}
                          value={f[key] || 0}
                          onInc={() => updatePos(activePlayer, f.pos, key, 1)}
                          onDec={() => updatePos(activePlayer, f.pos, key, -1)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {FIELDING_POSITIONS.filter(p => !active.fieldingList.find(f => f.pos === p)).map(pos => (
                    <button key={pos} onClick={() => addPos(activePlayer, pos)} style={{
                      fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '16px',
                      border: '1.5px dashed var(--gray-300)', background: 'white', color: 'var(--gray-500)', cursor: 'pointer'
                    }}>+ {POS_SHORT[pos]}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setActivePlayer(null); setFieldTab('batting'); }} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid var(--gray-200)',
                background: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer'
              }}>← Back</button>
              <button onClick={() => savePlayer(activePlayer)} disabled={isSaving} style={{
                flex: 2, padding: '12px', borderRadius: '10px', border: 'none',
                background: 'var(--red)', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer'
              }}>{isSaving ? 'Saving...' : '✓ Save Player'}</button>
            </div>
          </div>
        ) : (
          /* ── Player grid ── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {players.map(p => {
              const e = entries[p.id];
              const saved = e?.saved;
              const hasData = e && (e.batting.ab > 0 || e.fieldingList?.length > 0);
              return (
                <button key={p.id} onClick={() => { setActivePlayer(p.id); setFieldTab('batting'); }}
                  style={{
                    padding: '12px 6px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', position: 'relative',
                    border: `2px solid ${saved ? '#16A34A' : hasData ? 'var(--red)' : 'var(--gray-200)'}`,
                    background: saved ? '#DCFCE7' : hasData ? '#FEF2F2' : 'white',
                  }}>
                  {saved && <div style={{ position: 'absolute', top: 4, right: 6, fontSize: '12px', color: '#16A34A', fontWeight: '700' }}>✓</div>}
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '13px', fontWeight: '700', lineHeight: '1.2', color: saved ? '#16A34A' : 'var(--black)' }}>
                    {getFirstName(p)}
                  </div>
                  {p.jerseyNumber && <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>#{p.jerseyNumber}</div>}
                  {hasData && <div style={{ fontSize: '10px', color: saved ? '#16A34A' : 'var(--red)', fontWeight: '700', marginTop: '2px' }}>{calcAvg(e.batting)}</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
