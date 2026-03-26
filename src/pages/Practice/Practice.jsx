import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import { DRILLS, CATEGORIES, TUESDAY_PLAN, THURSDAY_PLAN } from '../../data/drills';

const DAY_MAP = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const PLANS = [TUESDAY_PLAN, THURSDAY_PLAN];
const PROGRESS_KEYS = ['tuesdayProgress', 'thursdayProgress'];

function getNextDate(slot) {
  if (slot.type === 'onetime') return slot.date || null;
  const targetDay = DAY_MAP[slot.day];
  if (targetDay === undefined) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(today);
  const diff = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  const endDate = slot.endDate ? new Date(slot.endDate + 'T23:59:59') : null;
  if (endDate && d > endDate) return null;
  return d.toISOString().split('T')[0];
}

export default function Practice() {
  const { isCoach } = useAuth();
  const [tab, setTab] = useState('drills');
  const [progress, setProgress] = useState([{}, {}]);
  const [practiceSchedule, setPracticeSchedule] = useState([]);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [selectedDrill, setSelectedDrill] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [customPlan, setCustomPlan] = useState({ duration: 75, drills: [] });
  const [practiceDetailModal, setPracticeDetailModal] = useState(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'settings', 'tuesdayProgress'), snap => {
        if (snap.exists()) setProgress(p => { const n = [...p]; n[0] = snap.data(); return n; });
      }),
      onSnapshot(doc(db, 'settings', 'thursdayProgress'), snap => {
        if (snap.exists()) setProgress(p => { const n = [...p]; n[1] = snap.data(); return n; });
      }),
      onSnapshot(doc(db, 'settings', 'practiceSchedule'), snap => {
        if (snap.exists() && snap.data().practices) setPracticeSchedule(snap.data().practices);
      }),
      onSnapshot(doc(db, 'settings', 'cancelledPractices'), snap => {
        setCancelledSlots(snap.exists() ? snap.data() : {});
      })
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const toggleDrillComplete = async (drillId, slotIndex) => {
    if (!isCoach) return;
    const key = PROGRESS_KEYS[slotIndex] || `practice${slotIndex}Progress`;
    const current = progress[slotIndex] || {};
    const newProgress = { ...current, [drillId]: !current[drillId] };
    await setDoc(doc(db, 'settings', key), newProgress, { merge: true });
  };

  const resetProgress = async (slotIndex) => {
    const key = PROGRESS_KEYS[slotIndex] || `practice${slotIndex}Progress`;
    await setDoc(doc(db, 'settings', key), {});
    setToast('Progress reset!');
  };

  const toggleCancelPractice = async (slotIndex) => {
    const updated = { ...cancelledSlots, [slotIndex]: !cancelledSlots[slotIndex] };
    await setDoc(doc(db, 'settings', 'cancelledPractices'), updated);
    setToast(updated[slotIndex] ? 'Practice cancelled.' : 'Practice cancellation removed.');
    // update modal state so the button label reflects the change immediately
    if (practiceDetailModal?.slotIndex === slotIndex) {
      setPracticeDetailModal(m => m ? { ...m } : null);
    }
  };

  const getDrill = (id) => DRILLS.find(d => d.id === id);

  // Next 2 upcoming practices from schedule
  const upcomingPractices = practiceSchedule
    .map((slot, i) => ({ slot, slotIndex: i, date: getNextDate(slot) }))
    .filter(p => p.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);

  const openPractice = (item) => {
    setPracticeDetailModal(item);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Practice" />

      <div className="page-content">

        {/* Upcoming Practices */}
        <div style={{ marginBottom: '20px' }}>
          <div className="section-header" style={{ marginBottom: '10px' }}>
            <span className="section-title">Upcoming Practices</span>
          </div>

          {upcomingPractices.length === 0 ? (
            <div style={{
              background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
              borderRadius: '12px', padding: '20px', textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
                No upcoming practices scheduled.
                {isCoach && ' Go to Schedule → Practices to set up the schedule.'}
              </p>
            </div>
          ) : (
            upcomingPractices.map(item => {
              const { slot, slotIndex, date } = item;
              const cancelled = !!cancelledSlots[slotIndex];
              const dateObj = new Date(date + 'T12:00:00');
              const dayLabel = slot.day || dateObj.toLocaleDateString('en-US', { weekday: 'long' });
              const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <button
                  key={slotIndex}
                  onClick={() => openPractice(item)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: cancelled ? '#FFF5F5' : 'white',
                    border: `1px solid ${cancelled ? '#FECACA' : 'var(--gray-200)'}`,
                    borderRadius: '12px', padding: '14px 16px',
                    marginBottom: '10px', display: 'flex', gap: '14px', alignItems: 'center'
                  }}
                >
                  {/* Date badge */}
                  <div style={{
                    background: cancelled ? '#FEE2E2' : 'linear-gradient(135deg, #CC1B1B, #8B0000)',
                    color: cancelled ? '#B91C1C' : 'white',
                    borderRadius: '10px', padding: '6px 10px',
                    textAlign: 'center', minWidth: '52px', flexShrink: 0
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', opacity: 0.85 }}>
                      {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
                      {dateObj.getDate()}
                    </div>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontWeight: '700', fontSize: '16px',
                        textDecoration: cancelled ? 'line-through' : 'none',
                        color: cancelled ? '#B91C1C' : 'var(--black)'
                      }}>{dayLabel}</span>
                      {cancelled && (
                        <span style={{
                          fontSize: '11px', fontWeight: '700', padding: '2px 7px',
                          borderRadius: '10px', background: '#FEE2E2', color: '#B91C1C'
                        }}>Cancelled</span>
                      )}
                    </div>
                    {slot.time && (
                      <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>{slot.time}</div>
                    )}
                    {slot.location && (
                      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>📍 {slot.location}</div>
                    )}
                    {slot.focus && (
                      <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', marginTop: '2px' }}>{slot.focus}</div>
                    )}
                  </div>

                  {/* Arrow */}
                  <span style={{ fontSize: '20px', color: 'var(--gray-300)', flexShrink: 0 }}>›</span>
                </button>
              );
            })
          )}
        </div>

        {/* Drill Library / Build tabs */}
        <div className="tabs">
          <button className={`tab ${tab === 'drills' ? 'active' : ''}`} onClick={() => setTab('drills')}>Drill Library</button>
          {isCoach && <button className={`tab ${tab === 'build' ? 'active' : ''}`} onClick={() => setTab('build')}>Build</button>}
        </div>

        {tab === 'drills' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '14px' }}>
              {['All', ...CATEGORIES].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: '20px',
                    border: `1.5px solid ${categoryFilter === cat ? 'var(--red)' : 'var(--gray-200)'}`,
                    background: categoryFilter === cat ? '#FEF2F2' : 'white',
                    color: categoryFilter === cat ? 'var(--red)' : 'var(--gray-500)',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >{cat}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {DRILLS.filter(d => categoryFilter === 'All' || d.category === categoryFilter).map(drill => (
                <DrillCard key={drill.id} drill={drill} onExpand={() => setSelectedDrill(drill)} />
              ))}
            </div>
          </div>
        )}

        {tab === 'build' && isCoach && (
          <PracticeBuilder customPlan={customPlan} setCustomPlan={setCustomPlan} setToast={setToast} />
        )}
      </div>

      {/* Practice Detail Modal */}
      {practiceDetailModal && (() => {
        const { slot, slotIndex, date } = practiceDetailModal;
        const cancelled = !!cancelledSlots[slotIndex];
        const plan = PLANS[slotIndex] || PLANS[0];
        const planDrills = plan.drills.map(id => getDrill(id)).filter(Boolean);
        const totalTime = planDrills.reduce((s, d) => s + d.duration, 0);
        const prog = progress[slotIndex] || {};
        const completedCount = planDrills.filter(d => prog[d.id]).length;
        const dateObj = new Date(date + 'T12:00:00');
        const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const displayName = slot.day
          ? `${slot.day}${slot.focus ? ` — ${slot.focus}` : ''}`
          : dateLabel;

        return (
          <div className="modal-overlay" onClick={() => setPracticeDetailModal(null)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="modal-handle" />

              {/* Cancelled banner */}
              {cancelled && (
                <div style={{
                  background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px',
                  padding: '10px 14px', marginBottom: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
                }}>
                  <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '14px' }}>🚫 Practice Cancelled</span>
                  {isCoach && (
                    <button onClick={() => toggleCancelPractice(slotIndex)} style={{
                      fontSize: '12px', fontWeight: '600', color: '#B91C1C',
                      background: 'none', border: '1px solid #FECACA', borderRadius: '8px',
                      padding: '4px 10px', cursor: 'pointer'
                    }}>Uncancel</button>
                  )}
                </div>
              )}

              {/* Header card */}
              <div style={{
                background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
                borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white'
              }}>
                <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', margin: 0 }}>{displayName}</h3>
                <p style={{ opacity: 0.8, fontSize: '13px', marginTop: '3px' }}>{dateLabel}</p>
                {slot.time && <p style={{ opacity: 0.8, fontSize: '14px', marginTop: '2px' }}>{slot.time}</p>}
                {slot.location && <p style={{ opacity: 0.8, fontSize: '13px', marginTop: '2px' }}>📍 {slot.location}</p>}
                <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>⏱ {totalTime} min</div>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>📋 {planDrills.length} drills</div>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>✅ {completedCount}/{planDrills.length}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '4px', height: '4px', marginTop: '10px', overflow: 'hidden' }}>
                  <div style={{
                    background: 'white', height: '100%', borderRadius: '4px',
                    width: `${planDrills.length ? (completedCount / planDrills.length) * 100 : 0}%`,
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>

              {/* Coach actions */}
              {isCoach && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <button onClick={() => resetProgress(slotIndex)} className="btn-secondary" style={{ flex: 1, fontSize: '13px', padding: '8px' }}>
                    Reset Progress
                  </button>
                  {!cancelled && (
                    <button onClick={() => toggleCancelPractice(slotIndex)} style={{
                      flex: 1, fontSize: '13px', padding: '8px', borderRadius: '10px', cursor: 'pointer',
                      fontWeight: '700', border: 'none', background: '#FEE2E2', color: '#B91C1C'
                    }}>Cancel Practice</button>
                  )}
                </div>
              )}

              {/* Drills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {planDrills.map((drill, index) => (
                  <DrillCard
                    key={drill.id}
                    drill={drill}
                    index={index}
                    completed={prog[drill.id]}
                    onToggle={isCoach ? () => toggleDrillComplete(drill.id, slotIndex) : undefined}
                    onExpand={() => setSelectedDrill(drill)}
                  />
                ))}
              </div>

              <button className="btn-secondary" onClick={() => setPracticeDetailModal(null)} style={{ width: '100%', marginTop: '16px' }}>
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* Drill Detail Modal */}
      {selectedDrill && (
        <DrillModal drill={selectedDrill} onClose={() => setSelectedDrill(null)} />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}

function DrillCard({ drill, index, completed, onToggle, onExpand }) {
  const categoryColors = {
    'Warm-up': '#FEF3C7', 'Fielding': '#DBEAFE', 'Hitting': '#DCFCE7',
    'Throwing': '#F3E8FF', 'Baserunning': '#FFE4E6', 'Pitching': '#FEF9C3',
    'Game': '#CFFAFE', 'Team': '#F1F5F9'
  };

  return (
    <div style={{
      background: completed ? '#F0FDF4' : 'white',
      border: `1px solid ${completed ? '#86EFAC' : 'var(--gray-200)'}`,
      borderRadius: '10px', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
      transition: 'all 0.2s'
    }}>
      {onToggle && (
        <button onClick={onToggle} style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `2px solid ${completed ? '#16A34A' : 'var(--gray-300)'}`,
          background: completed ? '#16A34A' : 'transparent',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '14px', flexShrink: 0
        }}>{completed ? '✓' : ''}</button>
      )}
      {index !== undefined && !onToggle && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--red)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '13px', flexShrink: 0
        }}>{index + 1}</div>
      )}
      <div style={{ flex: 1, cursor: 'pointer' }} onClick={onExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: '700', fontSize: '14px', color: completed ? '#16A34A' : 'var(--black)' }}>
            {drill.title}
          </span>
          {drill.isStation && (
            <span style={{ background: '#EDE9FE', color: '#7C3AED', fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px' }}>
              STATION
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '8px',
            background: categoryColors[drill.category] || 'var(--gray-100)',
            color: 'var(--gray-700)'
          }}>{drill.category}</span>
          <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>⏱ {drill.duration}min</span>
          <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>👤 {drill.coaches} coach{drill.coaches !== 1 ? 'es' : ''}</span>
        </div>
      </div>
      <button onClick={onExpand} style={{
        background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '18px', flexShrink: 0
      }}>›</button>
    </div>
  );
}

function DrillModal({ drill, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh' }}>
        <div className="modal-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', textTransform: 'uppercase' }}>{drill.title}</h3>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <span className="chip">{drill.category}</span>
              <span className="chip">⏱ {drill.duration} min</span>
              <span className="chip">👤 {drill.coaches} coach{drill.coaches !== 1 ? 'es' : ''}</span>
              {drill.isStation && <span className="chip" style={{ background: '#EDE9FE', borderColor: '#C4B5FD', color: '#7C3AED' }}>Station Drill</span>}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <h4 style={{ fontSize: '13px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>How It Works</h4>
          <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--gray-700)' }}>{drill.description}</p>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <h4 style={{ fontSize: '13px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Why It Works</h4>
          <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--gray-700)' }}>{drill.why}</p>
        </div>

        {drill.equipment.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <h4 style={{ fontSize: '13px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Equipment</h4>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {drill.equipment.map(eq => (
                <span key={eq} className="chip chip-green">{eq}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{
          background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px',
          padding: '12px', marginBottom: '16px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400E', marginBottom: '4px', textTransform: 'uppercase' }}>
            💡 Coach Tip
          </div>
          <p style={{ fontSize: '14px', color: '#92400E', lineHeight: '1.5' }}>{drill.tip}</p>
        </div>

        <button className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>Close</button>
      </div>
    </div>
  );
}

function PracticeBuilder({ customPlan, setCustomPlan, setToast }) {
  const [selectedDrills, setSelectedDrills] = useState([]);
  const [duration, setDuration] = useState(75);
  const [categoryFilter, setCategoryFilter] = useState('All');

  const toggleDrill = (drillId) => {
    setSelectedDrills(s => s.includes(drillId) ? s.filter(id => id !== drillId) : [...s, drillId]);
  };

  const totalTime = selectedDrills.reduce((s, id) => {
    const d = DRILLS.find(dr => dr.id === id);
    return s + (d?.duration || 0);
  }, 0);

  const visibleDrills = DRILLS.filter(d => categoryFilter === 'All' || d.category === categoryFilter);

  return (
    <div>
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="section-header">
          <span className="section-title">Custom Practice</span>
        </div>
        <div className="form-group">
          <label className="form-label">Target Duration</label>
          <select className="form-select" value={duration} onChange={e => setDuration(parseInt(e.target.value))}>
            <option value={60}>60 minutes</option>
            <option value={75}>75 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '16px', padding: '10px', background: 'var(--gray-50)', borderRadius: '8px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '24px', fontWeight: '700', color: totalTime > duration ? 'var(--red)' : 'var(--green)' }}>
              {totalTime}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>MIN USED</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '24px', fontWeight: '700' }}>{duration}</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>TARGET</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '24px', fontWeight: '700' }}>{selectedDrills.length}</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>DRILLS</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '12px' }}>
        {['All', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: '20px',
              border: `1.5px solid ${categoryFilter === cat ? 'var(--red)' : 'var(--gray-200)'}`,
              background: categoryFilter === cat ? '#FEF2F2' : 'white',
              color: categoryFilter === cat ? 'var(--red)' : 'var(--gray-500)',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >{cat}</button>
        ))}
      </div>

      <h4 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', textTransform: 'uppercase', color: 'var(--gray-600)', marginBottom: '10px' }}>
        Select Drills {categoryFilter !== 'All' && `· ${categoryFilter}`}
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleDrills.map(drill => (
          <div
            key={drill.id}
            onClick={() => toggleDrill(drill.id)}
            style={{
              background: selectedDrills.includes(drill.id) ? '#FEF2F2' : 'white',
              border: `1.5px solid ${selectedDrills.includes(drill.id) ? 'var(--red)' : 'var(--gray-200)'}`,
              borderRadius: '10px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'
            }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${selectedDrills.includes(drill.id) ? 'var(--red)' : 'var(--gray-300)'}`,
              background: selectedDrills.includes(drill.id) ? 'var(--red)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '12px'
            }}>{selectedDrills.includes(drill.id) ? '✓' : ''}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{drill.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{drill.category} · {drill.duration}min</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
