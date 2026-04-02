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
  const obpVal = s.obp ?? ((s.hits || 0) + (s.bb || 0)) / ((s.ab || 0) + (s.bb || 1));
  const obp = !s.ab ? '.000' : '.' + String(Math.round(obpVal * 1000)).padStart(3, '0');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--gray-200)', borderRadius: '8px', overflow: 'hidden' }}>
      <StatBox label="AVG" value={avg} />
      <StatBox label="OBP" value={obp} />
      <StatBox label="H"   value={s.hits || 0} />
      <StatBox label="HR"  value={s.hr   || 0} />
      <StatBox label="1B"  value={s.singles || 0} />
      <StatBox label="2B"  value={s.doubles || 0} />
      <StatBox label="3B"  value={s.triples || 0} />
      <StatBox label="RBI" value={s.rbi  || 0} />
      <StatBox label="R"   value={s.runs || 0} />
      <StatBox label="K"   value={s.k    || 0} />
      <StatBox label="BB"  value={s.bb   || 0} />
      <StatBox label="AB"  value={s.ab   || 0} />
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
  const [claimants, setClaimants] = useState([]);
  const [toast, setToast] = useState('');
  const [scoutingReport, setScoutingReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [practiceAgg, setPracticeAgg] = useState(null);
  const [practiceOpen, setPracticeOpen] = useState(false);

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
        setScoutingReport(data.scoutingReport || null);
        setPracticeAgg(data.practiceAgg || null);
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

  // When player loads, look up all users who have claimed this player via claimedBy UID map
  useEffect(() => {
    if (!player) return;
    const claimedByMap = (player.claimedBy && typeof player.claimedBy === 'object') ? player.claimedBy : {};
    const uids = Object.keys(claimedByMap);
    if (uids.length === 0) { setClaimants([]); return; }
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const results = uids.map(uid => {
        const userDoc = snap.docs.find(d => d.id === uid);
        const userData = userDoc ? userDoc.data() : {};
        const claimEntry = claimedByMap[uid];
        return {
          uid,
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || claimEntry?.name || 'Unknown',
          relationship: claimEntry?.relationship || '',
          phone: userData.phone || '',
          email: userData.email || ''
        };
      });
      setClaimants(results);
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

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerName: player?.childName || player?.firstName || 'Player',
          stats: currentSeason,
          career,
          ratings,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.report) throw new Error(data.error || 'Failed');
      await setDoc(doc(db, 'playerStats', id), { scoutingReport: data.report }, { merge: true });
      setScoutingReport(data.report);
      setToast('Scouting report generated!');
    } catch (err) {
      setToast('Error: ' + (err?.message || 'Unknown error'));
    } finally {
      setReportLoading(false);
    }
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
          {claimants.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {claimants.map((c, i) => (
                <div key={c.uid} style={{
                  fontSize: '14px', color: 'var(--gray-700)',
                  paddingTop: i > 0 ? '14px' : 0,
                  marginTop: i > 0 ? '14px' : 0,
                  borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                      background: '#FEF2F2', color: 'var(--red)',
                      padding: '2px 8px', borderRadius: '8px', letterSpacing: '0.5px'
                    }}>{c.relationship || 'Parent'}</span>
                    <span style={{ fontWeight: '700', fontSize: '15px' }}>{c.name}</span>
                  </div>
                  {c.phone && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--gray-400)', width: '50px', flexShrink: 0 }}>📞</span>
                      <a href={`tel:${c.phone}`} style={{ fontWeight: '600', color: 'var(--red)' }}>{c.phone}</a>
                    </div>
                  )}
                  {c.email && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--gray-400)', width: '50px', flexShrink: 0 }}>✉️</span>
                      <a href={`mailto:${c.email}`} style={{ fontWeight: '600', color: 'var(--red)', wordBreak: 'break-all' }}>{c.email}</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--gray-400)', textAlign: 'center', padding: '12px 0' }}>
              No parent has claimed this player yet
            </div>
          )}
        </div>

        {/* Practice Stats — coaches only */}
        {isCoach && practiceAgg && (
          <div className="card" style={{ marginBottom: '14px' }}>
            <button onClick={() => setPracticeOpen(o => !o)} style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                🏋️ Practice Stats
              </span>
              <span style={{ fontSize: '18px', color: 'var(--gray-400)', transform: practiceOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
            </button>

            {practiceOpen && (
              <div style={{ marginTop: '12px' }}>
                {/* Batting summary */}
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Batting</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--gray-200)', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
                  {[
                    { label: 'AVG', value: practiceAgg.ab > 0 ? '.' + String(Math.round((practiceAgg.avg ?? (practiceAgg.hits / practiceAgg.ab)) * 1000)).padStart(3,'0') : '.---' },
                    { label: 'AB',  value: practiceAgg.ab   || 0 },
                    { label: 'H',   value: (practiceAgg.singles||0)+(practiceAgg.doubles||0)+(practiceAgg.triples||0)+(practiceAgg.hr||0) },
                    { label: 'HR',  value: practiceAgg.hr   || 0 },
                    { label: 'RBI', value: practiceAgg.rbi  || 0 },
                    { label: 'K',   value: practiceAgg.k    || 0 },
                    { label: 'BB',  value: practiceAgg.bb   || 0 },
                    { label: 'R',   value: practiceAgg.runs || 0 },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'white', padding: '10px 6px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '18px', fontWeight: '700' }}>{value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Fielding breakdown */}
                {practiceAgg.fielding && Object.keys(practiceAgg.fielding).length > 0 && (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Fielding</div>
                    {Object.entries(practiceAgg.fielding).map(([pos, f]) => (
                      <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                        <span style={{ fontWeight: '700', fontSize: '13px' }}>{pos}</span>
                        <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                          {f.innings}inn · {f.putouts}PO · {f.assists}A · <span style={{ color: f.errors > 0 ? 'var(--red)' : '#16A34A', fontWeight: '700' }}>{f.errors}E</span>
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI Scouting Report */}
        <div className="card" style={{
          background: 'linear-gradient(135deg, #1e1e2e, #2d1b4e)',
          border: 'none', marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', color: 'white', textTransform: 'uppercase' }}>
              AI Scouting Report
            </span>
            <span style={{
              background: '#7C3AED', color: 'white', fontSize: '10px',
              padding: '2px 8px', borderRadius: '10px', fontWeight: '700'
            }}>Claude AI</span>
          </div>

          {scoutingReport ? (
            <>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', lineHeight: '1.7', marginBottom: '12px' }}>
                {scoutingReport}
              </p>
              {isCoach && (
                <button onClick={generateReport} disabled={reportLoading} style={{
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px', padding: '7px 14px', color: 'rgba(255,255,255,0.7)',
                  fontSize: '12px', fontWeight: '600', cursor: reportLoading ? 'not-allowed' : 'pointer'
                }}>
                  {reportLoading ? '⏳ Generating...' : '🔄 Regenerate'}
                </button>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5', marginBottom: '12px' }}>
                Personalized scouting report based on stats, ratings, and game performance.
              </p>
              {isCoach && (
                <button onClick={generateReport} disabled={reportLoading} style={{
                  background: reportLoading ? 'rgba(124,58,237,0.5)' : '#7C3AED',
                  border: 'none', borderRadius: '8px', padding: '10px 18px',
                  color: 'white', fontSize: '14px', fontWeight: '700',
                  cursor: reportLoading ? 'not-allowed' : 'pointer', width: '100%'
                }}>
                  {reportLoading ? '⏳ Generating Report...' : '✨ Generate Report'}
                </button>
              )}
              {!isCoach && (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                  Coach will generate a scouting report here.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
