import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Register() {
  const [role, setRole] = useState('parent');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: '',
    phone: '', childName: '', jerseyNumber: '', position: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const positions = ['Pitcher','Catcher','1st Base','2nd Base','3rd Base','Shortstop','Left Field','Left Center','Right Center','Right Field'];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    setError('');
    setLoading(true);
    try {
      const profileData = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        role,
        ...(role === 'parent' ? {
          childName: form.childName,
          jerseyNumber: form.jerseyNumber,
          position: form.position
        } : {})
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
            {['coach', 'parent'].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: `2px solid ${role === r ? 'var(--red)' : 'var(--gray-200)'}`,
                  background: role === r ? '#FEF2F2' : 'white',
                  color: role === r ? 'var(--red)' : 'var(--gray-500)',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'Oswald, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  transition: 'all 0.15s'
                }}
              >
                {r === 'coach' ? '⚾ Coach' : '👤 Parent'}
              </button>
            ))}
          </div>
        </div>

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
                <input className="form-input" value={form.childName} onChange={e => set('childName', e.target.value)} placeholder="Player's first name" required={role === 'parent'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Jersey #</label>
                  <input className="form-input" type="number" value={form.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} placeholder="00" min="0" max="99" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Position</label>
                  <select className="form-select" value={form.position} onChange={e => set('position', e.target.value)}>
                    <option value="">Select...</option>
                    {positions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
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
