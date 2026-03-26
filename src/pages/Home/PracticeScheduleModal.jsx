import { useState } from 'react';

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55'];

function parseTime(str) {
  if (!str) return { hour: '', minute: '00', ampm: 'PM' };
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m) return { hour: m[1], minute: m[2].padStart(2,'0'), ampm: m[3].toUpperCase() };
  return { hour: '', minute: '00', ampm: 'PM' };
}

function formatTime({ hour, minute, ampm }) {
  if (!hour) return '';
  return `${hour}:${minute} ${ampm}`;
}

function initSlot(p) {
  const slot = { type: 'recurring', ...p };
  if (!slot.startHour) {
    const t = slot.time || '';
    const parts = t.split('–').map(s => s.trim());
    if (parts.length === 2) {
      const endParsed = parseTime(parts[1]);
      const startParsed = parseTime(parts[0] + (parts[0].match(/AM|PM/i) ? '' : ' ' + endParsed.ampm));
      Object.assign(slot, {
        startHour: startParsed.hour, startMinute: startParsed.minute, startAmPm: startParsed.ampm,
        endHour: endParsed.hour, endMinute: endParsed.minute, endAmPm: endParsed.ampm,
      });
    } else if (parts.length === 1 && t) {
      const parsed = parseTime(t);
      Object.assign(slot, { startHour: parsed.hour, startMinute: parsed.minute, startAmPm: parsed.ampm, endHour: '', endMinute: '00', endAmPm: parsed.ampm });
    } else {
      Object.assign(slot, { startHour: '', startMinute: '00', startAmPm: 'PM', endHour: '', endMinute: '00', endAmPm: 'PM' });
    }
  }
  return slot;
}

function buildTimeString(slot) {
  const start = formatTime({ hour: slot.startHour, minute: slot.startMinute, ampm: slot.startAmPm });
  const end = formatTime({ hour: slot.endHour, minute: slot.endMinute, ampm: slot.endAmPm });
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

const selectStyle = {
  padding: '9px 8px', borderRadius: '8px', border: '1.5px solid var(--gray-200)',
  background: 'white', fontSize: '14px', color: 'var(--black)', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none', textAlign: 'center'
};

// Defined outside to prevent remount on every keystroke
function TimeRow({ label, hour, minute, ampm, onHour, onMinute, onAmPm }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '6px' }}>
        <select style={selectStyle} value={hour} onChange={e => onHour(e.target.value)}>
          <option value="">Hr</option>
          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select style={selectStyle} value={minute} onChange={e => onMinute(e.target.value)}>
          {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={selectStyle} value={ampm} onChange={e => onAmPm(e.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

function SlotCard({ slot, i, updateSlot, removeSlot }) {
  const isRecurring = (slot.type || 'recurring') === 'recurring';
  return (
    <div style={{ background: 'var(--gray-50)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{
          fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '8px',
          background: isRecurring ? '#EDE9FE' : '#DBEAFE',
          color: isRecurring ? '#7C3AED' : '#1D4ED8'
        }}>
          {isRecurring ? '🔁 Recurring' : '📅 One-time'}
        </span>
        <button onClick={() => removeSlot(i)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '18px', padding: 0 }}>×</button>
      </div>

      {isRecurring ? (
        <>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label className="form-label">Day of Week</label>
            <select className="form-select" value={slot.day || ''} onChange={e => updateSlot(i, 'day', e.target.value)}>
              <option value="">— Select day —</option>
              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label className="form-label">End Date (optional)</label>
            <input className="form-input" type="date" value={slot.endDate || ''} onChange={e => updateSlot(i, 'endDate', e.target.value)} />
            {slot.endDate && (
              <button onClick={() => updateSlot(i, 'endDate', '')} style={{
                marginTop: '4px', fontSize: '11px', color: 'var(--gray-400)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0
              }}>✕ Clear end date</button>
            )}
          </div>
        </>
      ) : (
        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={slot.date || ''} onChange={e => updateSlot(i, 'date', e.target.value)} />
        </div>
      )}

      <TimeRow
        label="Start Time"
        hour={slot.startHour || ''}
        minute={slot.startMinute || '00'}
        ampm={slot.startAmPm || 'PM'}
        onHour={v => updateSlot(i, 'startHour', v)}
        onMinute={v => updateSlot(i, 'startMinute', v)}
        onAmPm={v => updateSlot(i, 'startAmPm', v)}
      />
      <TimeRow
        label="End Time"
        hour={slot.endHour || ''}
        minute={slot.endMinute || '00'}
        ampm={slot.endAmPm || 'PM'}
        onHour={v => updateSlot(i, 'endHour', v)}
        onMinute={v => updateSlot(i, 'endMinute', v)}
        onAmPm={v => updateSlot(i, 'endAmPm', v)}
      />

      <div className="form-group" style={{ marginBottom: '8px' }}>
        <label className="form-label">Location</label>
        <input className="form-input" value={slot.location || ''} onChange={e => updateSlot(i, 'location', e.target.value)} placeholder="e.g. Riverside Park Field 2" />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Focus</label>
        <input className="form-input" value={slot.focus || ''} onChange={e => updateSlot(i, 'focus', e.target.value)} placeholder="e.g. Hitting Focus" />
      </div>
    </div>
  );
}

export default function PracticeScheduleModal({ current, onSave, onClose }) {
  const [slots, setSlots] = useState(current.map(initSlot));

  const updateSlot = (i, key, val) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  };

  const addSlot = (type) => {
    setSlots(prev => [...prev, type === 'recurring'
      ? { type: 'recurring', day: '', startHour: '', startMinute: '00', startAmPm: 'PM', endHour: '', endMinute: '00', endAmPm: 'PM', focus: '', location: '', endDate: '' }
      : { type: 'onetime', date: '', startHour: '', startMinute: '00', startAmPm: 'PM', endHour: '', endMinute: '00', endAmPm: 'PM', focus: '', location: '' }
    ]);
  };

  const removeSlot = (i) => {
    setSlots(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = () => {
    onSave(slots.map(slot => ({ ...slot, time: buildTimeString(slot) })));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
          Edit Practice Schedule
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
          Recurring practices repeat every week on the selected day. One-time practices show on a specific date.
        </p>

        {slots.map((slot, i) => (
          <SlotCard key={i} slot={slot} i={i} updateSlot={updateSlot} removeSlot={removeSlot} />
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => addSlot('recurring')} style={{
            padding: '10px', border: '1.5px dashed #7C3AED', borderRadius: '10px',
            background: 'none', color: '#7C3AED', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
          }}>🔁 Add Recurring</button>
          <button onClick={() => addSlot('onetime')} style={{
            padding: '10px', border: '1.5px dashed #1D4ED8', borderRadius: '10px',
            background: 'none', color: '#1D4ED8', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
          }}>📅 Add One-time</button>
        </div>

        <button className="btn-primary" onClick={handleSave}>Save Schedule</button>
      </div>
    </div>
  );
}
