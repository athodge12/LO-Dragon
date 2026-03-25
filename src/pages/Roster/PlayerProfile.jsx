import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

const radarCategories = ['Speed', 'Power', 'Contact', 'Fielding', 'Throwing', 'Coachability'];
const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

export default function PlayerProfile() {
  const { id } = useParams();
  const { isCoach } = useAuth();
  const [player, setPlayer] = useState(null);
  const [stats, setStats] = useState(null);
  const [ratings, setRatings] = useState({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsubs = [];
    unsubs.push(onSnapshot(doc(db, 'users', id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setPlayer(data);
        setEditForm(data);
      }
    }));
    unsubs.push(onSnapshot(doc(db, 'playerStats', id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(data.career || {});
        setRatings(data.ratings || {});
      }
    }));
    return () => unsubs.forEach(u => u());
  }, [id]);

  const saveProfile = async () => {
    await setDoc(doc(db, 'users', id), editForm, { merge: true });
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

  const radarData = radarCategories.map(cat => ({
    category: cat,
    value: ratings[cat] || 5
  }));

  if (!player) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Player Profile" back="/roster" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div className="loading-spinner" />
      </div>
    </div>
  );

  const playerName = player.childName || `${player.firstName || ''} ${player.lastName || ''}`.trim();
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
            {player.position && (
              <p style={{ opacity: 0.85, fontSize: '14px', marginTop: '4px' }}>{player.position}</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Jersey #</label>
                <input className="form-input" value={editForm.jerseyNumber || ''} onChange={e => setEditForm(f => ({ ...f, jerseyNumber: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Position</label>
                <select className="form-select" value={editForm.position || ''} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}>
                  <option value="">Select...</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <button className="btn-primary" onClick={saveProfile} style={{ marginTop: '12px' }}>Save Changes</button>
          </div>
        )}

        {/* Career Stats */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">📊 Career Stats</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--gray-200)', borderRadius: '8px', overflow: 'hidden' }}>
            {[
              { label: 'AVG', value: stats?.avg ? `.${String(Math.round(stats.avg * 1000)).padStart(3, '0')}` : '.000' },
              { label: 'HR', value: stats?.hr || 0 },
              { label: 'RBI', value: stats?.rbi || 0 },
              { label: 'R', value: stats?.runs || 0 },
              { label: 'SB', value: stats?.sb || 0 },
              { label: 'ERA', value: stats?.era ? stats.era.toFixed(2) : '--' }
            ].map(s => (
              <div key={s.label} style={{ background: 'white', padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: '700', color: 'var(--black)' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Radar Chart */}
        <div className="card" style={{ marginBottom: '14px' }}>
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
        </div>

        {/* Contact Info */}
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="section-header">
            <span className="section-title">📞 Parent Contact</span>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--gray-400)', width: '70px' }}>Parent</span>
              <span style={{ fontWeight: '600' }}>
                {player.parentName || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Not set'}
              </span>
            </div>
            {player.phone && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--gray-400)', width: '70px' }}>Phone</span>
                <a href={`tel:${player.phone}`} style={{ fontWeight: '600', color: 'var(--red)' }}>{player.phone}</a>
              </div>
            )}
            {player.email && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--gray-400)', width: '70px' }}>Email</span>
                <a href={`mailto:${player.email}`} style={{ fontWeight: '600', color: 'var(--red)', wordBreak: 'break-all' }}>{player.email}</a>
              </div>
            )}
          </div>
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
