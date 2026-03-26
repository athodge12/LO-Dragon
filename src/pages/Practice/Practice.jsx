import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import { DRILLS, CATEGORIES, TUESDAY_PLAN, THURSDAY_PLAN } from '../../data/drills';

const DEFAULT_SCHEDULE = [
  { day: 'Tuesday', time: '4:45 – 6:00 PM' },
  { day: 'Thursday', time: '7:15 – 8:30 PM' }
];

const PLANS = [TUESDAY_PLAN, THURSDAY_PLAN];
const PROGRESS_KEYS = ['tuesdayProgress', 'thursdayProgress'];

export default function Practice() {
  const { isCoach } = useAuth();
  const [tab, setTab] = useState('slot0');
  const [progress, setProgress] = useState([{}, {}]);
  const [practiceSchedule, setPracticeSchedule] = useState(DEFAULT_SCHEDULE);
  const [cancelledSlots, setCancelledSlots] = useState({});
  const [selectedDrill, setSelectedDrill] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [customPlan, setCustomPlan] = useState({ duration: 75, drills: [] });

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
  };

  const getDrill = (id) => DRILLS.find(d => d.id === id);

  const filteredDrills = CATEGORIES === categoryFilter || categoryFilter === 'All'
    ? DRILLS
    : DRILLS.filter(d => d.category === categoryFilter);

  const PlanView = ({ plan, progress, slotIndex }) => {
    const planDrills = plan.drills.map(id => getDrill(id)).filter(Boolean);
    const totalTime = planDrills.reduce((s, d) => s + d.duration, 0);
    const completedCount = planDrills.filter(d => progress[d.id]).length;

    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
          borderRadius: '12px', padding: '16px', marginBottom: '14px', color: 'white'
        }}>
          <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', margin: 0 }}>{plan.name}</h3>
          <p style={{ opacity: 0.8, fontSize: '14px', marginTop: '4px' }}>{plan.time}</p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <div style={{ fontSize: '13px', opacity: 0.9 }}>⏱ {totalTime} min</div>
            <div style={{ fontSize: '13px', opacity: 0.9 }}>📋 {planDrills.length} drills</div>
            <div style={{ fontSize: '13px', opacity: 0.9 }}>✅ {completedCount}/{planDrills.length}</div>
          </div>
          {/* Progress bar */}
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '4px', height: '4px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{
              background: 'white', height: '100%', borderRadius: '4px',
              width: `${planDrills.length ? (completedCount / planDrills.length) * 100 : 0}%`,
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {isCoach && (
          <button onClick={() => resetProgress(slotIndex)} className="btn-secondary" style={{ marginBottom: '12px', width: 'auto', fontSize: '12px', padding: '6px 12px' }}>
            Reset Progress
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {planDrills.map((drill, index) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              index={index}
              completed={progress[drill.id]}
              onToggle={() => toggleDrillComplete(drill.id, slotIndex)}
              onExpand={() => setSelectedDrill(drill)}
            />
          ))}
        </div>
      </div>
    );
  };

  const slotTabs = practiceSchedule.slice(0, PLANS.length).map((slot, i) => ({
    key: `slot${i}`,
    label: slot.day || `Practice ${i + 1}`,
    cancelled: !!cancelledSlots[i]
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Practice" />

      <div className="page-content">
        <div className="tabs">
          {slotTabs.map(t => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}
              style={{ position: 'relative' }}>
              {t.label}
              {t.cancelled && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 8, height: 8, borderRadius: '50%', background: '#B91C1C'
                }} />
              )}
            </button>
          ))}
          <button className={`tab ${tab === 'drills' ? 'active' : ''}`} onClick={() => setTab('drills')}>Drill Library</button>
          {isCoach && <button className={`tab ${tab === 'build' ? 'active' : ''}`} onClick={() => setTab('build')}>Build</button>}
        </div>

        {slotTabs.map((t, i) => tab === t.key && (
          <div key={t.key}>
            {cancelledSlots[i] && (
              <div style={{
                background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px',
                padding: '12px 16px', marginBottom: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🚫</span>
                  <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '15px' }}>
                    {t.label} Practice Cancelled
                  </span>
                </div>
                {isCoach && (
                  <button onClick={() => toggleCancelPractice(i)} style={{
                    fontSize: '12px', fontWeight: '600', color: '#B91C1C',
                    background: 'none', border: '1px solid #FECACA', borderRadius: '8px',
                    padding: '4px 10px', cursor: 'pointer'
                  }}>Uncancel</button>
                )}
              </div>
            )}
            {isCoach && !cancelledSlots[i] && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <button onClick={() => toggleCancelPractice(i)} style={{
                  fontSize: '12px', fontWeight: '600', color: '#B91C1C',
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px',
                  padding: '6px 12px', cursor: 'pointer'
                }}>Cancel Practice</button>
              </div>
            )}
            <PlanView plan={PLANS[i]} progress={progress[i] || {}} slotIndex={i} />
          </div>
        ))}

        {tab === 'drills' && (
          <div>
            {/* Category filter */}
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
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >{cat}</button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {DRILLS.filter(d => categoryFilter === 'All' || d.category === categoryFilter).map(drill => (
                <DrillCard
                  key={drill.id}
                  drill={drill}
                  onExpand={() => setSelectedDrill(drill)}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'build' && isCoach && (
          <PracticeBuilder customPlan={customPlan} setCustomPlan={setCustomPlan} setToast={setToast} />
        )}
      </div>

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
      <div style={{ flex: 1, minWidth: 0 }} onClick={onExpand} role="button" style={{ flex: 1, cursor: 'pointer' }}>
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

  const toggleDrill = (drillId) => {
    setSelectedDrills(s => s.includes(drillId) ? s.filter(id => id !== drillId) : [...s, drillId]);
  };

  const totalTime = selectedDrills.reduce((s, id) => {
    const d = DRILLS.find(dr => dr.id === id);
    return s + (d?.duration || 0);
  }, 0);

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

      <h4 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', textTransform: 'uppercase', color: 'var(--gray-600)', marginBottom: '10px' }}>
        Select Drills
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {DRILLS.map(drill => (
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
