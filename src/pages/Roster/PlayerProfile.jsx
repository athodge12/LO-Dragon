import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, collection, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

function StatBox({ label, value }) {
  return (
    <div style={{ background: 'white', padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: 'var(--black)' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
        {label}
      </div>
    </div>
  );
}

function StatsGrid({ s = {} }) {
  const avg = !s.ab ? '.000' : '.' + String(Math.round((s.avg ?? (s.hits / s.ab)) * 1000)).padStart(3, '0');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--gray-200)', borderRadius: '8px', overflow: 'hidden' }}>
      <StatBox label="AVG" value={avg} />
      <StatBox label="HR" value={s.hr || 0} />
      <StatBox label="RBI" value={s.rbi || 0} />
      <StatBox label="R" value={s.runs || 0} />
      <StatBox label="SB" value={s.sb || 0} />
      <StatBox label="ERA" value={s.era ? s.era.toFixed(2) : '--'} />
    </div>
  );
}

const radarCategories = ['Speed', 'Power', 'Contact', 'Fielding', 'Throwing', 'Coachability'];
const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

export default function PlayerProfile() {
  const { id } = useParams();
  const { isCoach } = useAuth();
  const [player, setPlayer] = useState(null);
  const [career, setCareer] = useState({});
  const [currentSeason, setCurrentSeason] = useState({});
  const [seasonYear, setSeasonYear] = useState('2026');
  const [ratings, setRatings] = useState({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [linkedParent, setLinkedParent] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(doc(db, 'roster', id), snap => {
      if (snap.exists()) { setPlayer(snap.data()); setEditForm(snap.data()); }
    }));
    unsubs.push(onSnapshot(doc(db, 'playerStats', id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setCareer(data.career || {});
        setRatings(data.ratings || {});
        // currentSeason updated below once we know the year
        unsubs.push(onSnapshot(doc(db, 'settings', 'season'), yearSnap => {
          const year = yearSnap.exists() ? yearSnap.data().year : '2026';
          setSeasonYear(year);
          setCurrentSeason(data.seasons?.[year] || {});
        }));
      }
    }));
    return () => unsubs.forEach(u => u());
  }, [id]);

  // When player loads, find the parent who claimed them
  useEffect(() => {
    if (!player) return;
    const playerName = (player.name || player.childName || `${player.firstName || ''} ${player.lastName || ''}`.trim()).toLowerCase();
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const match = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(u => {
          if (u.role !== 'parent' && !u.roles?.includes('parent')) return false;
          const cn = (u.childName || '').toLowerCase().trim();
          return cn && (playerName.includes(cn) || cn.includes(playerName));
        });
      setLinkedParent(match || null);
    });
    return () => unsub();
  }, [player]);

  const saveProfile = async () => {
    await setDoc(doc(db, 'roster', id), editForm, { merge: true });
    setEditing(false);
    setToast('Profile updated!');
  };

  const saveRatings = async (newRatings) => {
    const ref = doc(db, 'playerStats', id);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(ref, { ...current, ratings: newRatings }, { merge: true });
    setRatings(newRatings);
    setToast('Ratings saved!');
  };

  const radarData = radarCategories.map(cat => ({ category: cat, value: ratings[cat] || 5 }));

  if (!player) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Player Profile" back="/roster" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div className="loading-spinner" />
      </div>
    </div>
  );

  const playerName = player.name || player.childName || `${player.firstName || ''} ${player.lastName || ''}`.trim();
  const initials = playerName.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title={playerName} back="/roster" actions={isCoach && (
        <button onClick={() => setEditing(!editing)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', fontSize: '16px'
        }}>✏️</button>
      )} />

      <div className="page-content">
        {/* Player Header */}
        <div style={{
          background: 'linear-gradient(135deg, #CC1B1B, #8B0000)',
          borderRadius: '14px', padding: '24px', marginBottom: '14px',
          display: 'flex', alignItems: 'center', gap: '16px', color: 'white'
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Oswald, sans-serif', fontSize: '28px', fontWeight: '700',
            flexShrink: 0
          }}>{player.jerseyNumber ? `#${player.jerseyNumber}` : initials}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '700', margin: 0 }}>{playerName}</h2>
            {player.positions?.length > 0 && (
              <p style={{ opacity: 0.85, fontSize: '14px', marginTop: '4px' }}>{player.positions.join(' · ')}</p>
            )}
            {player.jerseyNumber && (
              <p style={{ opacity: 0.7, fontSize: '13px' }}>Jersey #{player.jerseyNumber}</p>
            )}
          </div>
        </div>

        {/* Edit Form */}
        {editing && isCoach && (
          <div className="card" style={{ marginBottom: '14px' }}>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', marginBottom: '12px', textTransform: 'uppercase' }}>
              Edit Player
            </h3>
            <div className="form-group">
              <label className="form-label">Jersey #</label>
              <input className="form-input" value={editForm.jerseyNumber || ''} onChange={e => setEditForm(f => ({ ...f, jerseyNumber: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">
                Primary Positions <span style={{ fontWeight: '400', color: 'var(--gray-400)' }}>(pick up to 3)</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {positions.map(pos => {
                  const selected = (editForm.positions || []).includes(pos);
                  const atLimit = (editForm.positions || []).length >= 3;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        const cur = editForm.positions || [];
                        if (selected) {
                          setEditForm(f => ({ ...f, positions: cur.filter(p => p !== pos) }));
                        } else if (!atLimit) {
                          setEditForm(f => ({ ...f, positions: [...cur, pos] }));
                        }
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: '20px', cursor: selected || !atLimit ? 'pointer' : 'default',
                        border: `1.5px solid ${selected ? 'var(--red)' : 'var(--gray-200)'}`,
                        background: selected ? '#FEF2F2' : 'white',
                        color: selected ? 'var(--red)' : atLimit && !selected ? 'var(--gray-300)' : 'var(--gray-600)',
                        fontWeight: selected ? '700' : '400', fontSize: '13px'
                      }}
                    >{pos}</button>
                  );
                })}
              </div>
            </div>
            <button className="btn-primary" onClick={saveProfile}>Save Changes</button>
          </div>
        )}

        {/* Current Season Stats */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">⚾ {seasonYear} Season</span>
            <span style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: '600', textTransform: 'uppercase' }}>Current</span>
          </div>
          <StatsGrid s={currentSeason} />
        </div>

        {/* Career Stats */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">📊 Career Stats</span>
            <span style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: '600', textTransform: 'uppercase' }}>All-Time</span>
          </div>
          <StatsGrid s={career} />
        </div>

        {/* Radar Chart — coach only */}
        {isCoach && <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">⚡ Player Ratings</span>
            {isCoach && <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Tap to edit</span>}
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Radar dataKey="value" stroke="#CC1B1B" fill="#CC1B1B" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {isCoach && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
              {radarCategories.map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)', width: '90px', flexShrink: 0 }}>{cat}</span>
                  <input
                    type="range" min="1" max="10" step="1"
                    value={ratings[cat] || 5}
                    onChange={e => {
                      const newRatings = { ...ratings, [cat]: parseInt(e.target.value) };
                      setRatings(newRatings);
                    }}
                    onMouseUp={() => saveRatings(ratings)}
                    onTouchEnd={() => saveRatings(ratings)}
                    style={{ flex: 1, accentColor: 'var(--red)' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--red)', width: '20px', textAlign: 'right' }}>
                    {ratings[cat] || 5}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Contact Info */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">📞 Parent Contact</span>
          </div>
          {linkedParent ? (
            <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--gray-400)', width: '70px', flexShrink: 0 }}>Parent</span>
                <span style={{ fontWeight: '600' }}>{`${linkedParent.firstName || ''} ${linkedParent.lastName || ''}`.trim() || 'Unknown'}</span>
              </div>
              {linkedParent.phone && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--gray-400)', width: '70px', flexShrink: 0 }}>Phone</span>
                  <a href={`tel:${linkedParent.phone}`} style={{ fontWeight: '600', color: 'var(--red)' }}>{linkedParent.phone}</a>
                </div>
              )}
              {linkedParent.email && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ color: 'var(--gray-400)', width: '70px', flexShrink: 0 }}>Email</span>
                  <a href={`mailto:${linkedParent.email}`} style={{ fontWeight: '600', color: 'var(--red)', wordBreak: 'break-all' }}>{linkedParent.email}</a>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--gray-400)', textAlign: 'center', padding: '12px 0' }}>
              No parent account linked yet
            </div>
          )}
        </div>

        {/* AI Scouting Placeholder */}
        <div className="card" style={{
          background: 'linear-gradient(135deg, #1e1e2e, #2d1b4e)',
          border: 'none', marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', color: 'white', textTransform: 'uppercase' }}>
              AI Scouting Report
            </span>
            <span style={{
              background: '#7C3AED', color: 'white', fontSize: '10px',
              padding: '2px 8px', borderRadius: '10px', fontWeight: '700'
            }}>COMING SOON</span>
          </div>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
            Powered by Claude AI — personalized scouting reports based on stats, ratings, and game performance.
          </p>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
