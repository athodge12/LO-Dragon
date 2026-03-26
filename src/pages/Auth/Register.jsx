import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

const ROLES = [
  { key: 'coach',      label: '⚾ Coach',       desc: 'Full access',         locked: true  },
  { key: 'parent',     label: '👤 Parent',      desc: 'Player & RSVP',       locked: false },
  { key: 'bookkeeper', label: '💰 Bookkeeper',  desc: 'Dues management',     locked: true  },
  { key: 'fan',        label: '🎉 Fan',         desc: 'View only',           locked: false },
];

export default function Register() {
  const [role, setRole] = useState('parent');
  const [accessCode, setAccessCode] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
    phone: '', childName: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const needsCode = role === 'coach' || role === 'bookkeeper';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');

    setError('');
    setLoading(true);
    try {
      // Validate access code for locked roles
      if (needsCode) {
        let correctCode = role === 'coach' ? 'DRAGONS-COACH' : 'DRAGONS-BOOKS';
        try {
          const snap = await getDoc(doc(db, 'settings', 'accessCodes'));
          if (snap.exists() && snap.data()[role]) correctCode = snap.data()[role];
        } catch {
          // Firestore read failed — fall back to default codes
        }
        if (accessCode.trim().toUpperCase() !== correctCode.toUpperCase()) {
          setError('Invalid access code. Contact your coach to get the code.');
          setLoading(false);
          return;
        }
      }

      const profileData = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        role,
        roles: [role],
        ...(role === 'parent' ? { childName: form.childName } : {})
      };
      await register(form.email, form.password, profileData);
      navigate('/');
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #8B0000 0%, #CC1B1B 30%, #f5f5f5 100%)',
      padding: '0 24px 40px'
    }}>
      <div style={{ textAlign: 'center', paddingTop: '40px', paddingBottom: '24px' }}>
        <h1 style={{
          color: 'white', fontSize: '28px', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '3px',
          fontFamily: 'Oswald, sans-serif', margin: 0
        }}>Join the Team</h1>
      </div>

      <div style={{
        background: 'white', borderRadius: '20px',
        padding: '24px', width: '100%', maxWidth: '380px',
        margin: '0 auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
      }}>
        {/* Role Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>I am a</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {ROLES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => { setRole(r.key); setAccessCode(''); setError(''); }}
                style={{
                  padding: '12px 8px',
                  borderRadius: '10px',
                  border: `2px solid ${role === r.key ? 'var(--red)' : 'var(--gray-200)'}`,
                  background: role === r.key ? '#FEF2F2' : 'white',
                  color: role === r.key ? 'var(--red)' : 'var(--gray-500)',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'Oswald, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  transition: 'all 0.15s',
                  position: 'relative',
                  textAlign: 'center'
                }}
              >
                {r.label}
                {r.locked && (
                  <span style={{
                    position: 'absolute', top: 4, right: 6,
                    fontSize: '10px', opacity: 0.5
                  }}>🔒</span>
                )}
                <div style={{ fontSize: '10px', fontWeight: '400', marginTop: '2px', opacity: 0.7, fontFamily: 'Source Sans 3, sans-serif', textTransform: 'none' }}>
                  {r.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Access code for locked roles */}
        {needsCode && (
          <div style={{
            background: '#FFF5F5', border: '1px solid #FECACA',
            borderRadius: '10px', padding: '12px 14px', marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span>🔒</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Access Code Required
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '10px' }}>
              {role === 'coach' ? 'Coach' : 'Bookkeeper'} accounts require a private access code. Contact your coach to get it.
            </p>
            <input
              className="form-input"
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              placeholder="Enter access code..."
              style={{ letterSpacing: '2px', textTransform: 'uppercase' }}
              required
            />
          </div>
        )}

        {error && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #FECACA',
            borderRadius: '8px', padding: '10px 14px',
            fontSize: '14px', color: '#B91C1C', marginBottom: '16px'
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">First Name</label>
              <input className="form-input" value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="John" required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Last Name</label>
              <input className="form-input" value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" required />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" required />
          </div>

          <div className="form-group">
            <label className="form-label">Phone (optional)</label>
            <input className="form-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" />
          </div>

          {role === 'parent' && (
            <>
              <div className="divider" />
              <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Player Info
              </p>
              <div className="form-group">
                <label className="form-label">Child's Name</label>
                <input className="form-input" value={form.childName} onChange={e => set('childName', e.target.value)} placeholder="Player's first name" required />
              </div>
            </>
          )}

          <div className="divider" />

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-input" type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="••••••••" required />
          </div>

          <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: '4px' }}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: 'var(--gray-500)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--red)', fontWeight: '600' }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}
