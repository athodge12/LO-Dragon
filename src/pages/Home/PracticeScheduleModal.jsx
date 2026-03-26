import { useState } from 'react';

export default function PracticeScheduleModal({ current, onSave, onClose }) {
  const [slots, setSlots] = useState(current.map(p => ({ type: 'recurring', ...p })));

  const updateSlot = (i, key, val) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  };

  const addSlot = (type) => {
    setSlots(prev => [...prev, type === 'recurring'
      ? { type: 'recurring', day: '', time: '', focus: '', location: '' }
      : { type: 'onetime', date: '', time: '', focus: '', location: '' }
    ]);
  };

  const removeSlot = (i) => {
    setSlots(prev => prev.filter((_, idx) => idx !== i));
  };

  const SlotCard = ({ slot, i }) => {
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
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label className="form-label">Day of Week</label>
            <select className="form-select" value={slot.day || ''} onChange={e => updateSlot(i, 'day', e.target.value)}>
              <option value="">— Select day —</option>
              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: '8px' }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={slot.date || ''} onChange={e => updateSlot(i, 'date', e.target.value)} />
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '8px' }}>
          <label className="form-label">Time</label>
          <input className="form-input" value={slot.time || ''} onChange={e => updateSlot(i, 'time', e.target.value)} placeholder="e.g. 4:45 – 6:00 PM" />
        </div>
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

        {slots.map((slot, i) => <SlotCard key={i} slot={slot} i={i} />)}

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

        <button className="btn-primary" onClick={() => onSave(slots)}>Save Schedule</button>
      </div>
    </div>
  );
}
