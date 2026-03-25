import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import DragonLogo from '../../components/UI/DragonLogo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #8B0000 0%, #CC1B1B 40%, #f5f5f5 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 24px'
    }}>
      {/* Logo section */}
      <div style={{ textAlign: 'center', paddingTop: '60px', paddingBottom: '32px' }}>
        <DragonLogo width={160} style={{ marginBottom: '12px' }} />
        <h1 style={{
          color: 'white',
          fontSize: '36px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '4px',
          fontFamily: 'Oswald, sans-serif',
          margin: 0
        }}>Dragons</h1>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', marginTop: '6px' }}>
          U8 Recreational Baseball
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '28px 24px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{
          fontFamily: 'Oswald, sans-serif',
          fontSize: '22px',
          fontWeight: '600',
          color: 'var(--black)',
          marginBottom: '20px',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>Welcome Back</h2>

        {error && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #FECACA',
            borderRadius: '8px', padding: '10px 14px',
            fontSize: '14px', color: '#B91C1C', marginBottom: '16px'
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="coach@dragons.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: '4px' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{
          textAlign: 'center', marginTop: '20px',
          fontSize: '14px', color: 'var(--gray-500)'
        }}>
          New to the team?{' '}
          <Link to="/register" style={{ color: 'var(--red)', fontWeight: '600' }}>
            Create Account
          </Link>
        </p>
      </div>

      <p style={{
        color: 'rgba(255,255,255,0.4)', fontSize: '12px',
        marginTop: '32px', textAlign: 'center'
      }}>
        🔒 Secure team access only
      </p>
    </div>
  );
}
