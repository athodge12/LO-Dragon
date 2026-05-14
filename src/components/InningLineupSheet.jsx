import { useState } from 'react';

const FIELDING_POSITIONS = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

export default function InningLineupSheet({ inning, players, allLineups = {}, onSave, onClose }) {
  // Find most recent previous inning that has data (not just inning-1)
  const prevInning = (() => {
    for (let i = inning - 1; i >= 1; i--) {
      if (allLineups[String(i)] && Object.keys(allLineups[String(i)]).length > 0) return i;
    }
    return null;
  })();

  const current  = allLineups[String(inning)] || {};
  const previous = prevInning ? allLineups[String(prevInning)] : {};

  // Auto-fill from most recent previous if this inning hasn't been set yet
  const [lineup, setLineup] = useState(() =>
    Object.keys(current).length > 0 ? { ...current } : { ...previous }
  );

  const sortedPlayers = [...players].sort((a, b) =>
    parseInt(a.jerseyNumber || 99) - parseInt(b.jerseyNumber || 99)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', margin: 0, textTransform: 'uppercase' }}>
            Inning {inning} Lineup
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--gray-400)', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Show which inning we pre-filled from, or offer reset */}
        {prevInning && Object.keys(current).length === 0 && (
          <p style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '10px', textAlign: 'center' }}>
            Pre-filled from Inning {prevInning} — change any positions that rotated
          </p>
        )}
        {prevInning && Object.keys(current).length > 0 && (
          <button onClick={() => setLineup({ ...previous })} style={{
            width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '8px',
            border: '1.5px dashed var(--gray-300)', background: 'none',
            color: 'var(--gray-500)', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
          }}>↩ Reset to Inning {prevInning} lineup</button>
        )}

        {FIELDING_POSITIONS.map(pos => (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', minWidth: '115px', color: 'var(--gray-700)' }}>{pos}</span>
            <select
              value={lineup[pos] || ''}
              onChange={e => setLineup(l => ({ ...l, [pos]: e.target.value || undefined }))}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1.5px solid var(--gray-200)', fontSize: '13px', background: 'white', color: 'var(--black)' }}
            >
              <option value="">— Not playing —</option>
              {sortedPlayers.map(p => (
                <option key={p.id} value={p.id}>#{p.jerseyNumber || '—'} {p.name}</option>
              ))}
            </select>
          </div>
        ))}

        <button className="btn-primary" onClick={() => { onSave(lineup); onClose(); }} style={{ marginTop: '12px' }}>
          Save Lineup
        </button>
      </div>
    </div>
  );
}
