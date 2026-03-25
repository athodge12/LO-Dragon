import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Header({ title, back, actions }) {
  const { logout, userProfile } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header style={{
      background: 'linear-gradient(135deg, #CC1B1B 0%, #8B0000 100%)',
      height: 'var(--header-height)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '12px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      flexShrink: 0
    }}>
      {back ? (
        <button onClick={() => navigate(back)} style={{
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: '8px',
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', flexShrink: 0
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
      ) : (
        <div style={{ width: 36, height: 36, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, textAlign: 'center' }}>
        <h1 style={{
          color: 'white',
          fontSize: '20px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontFamily: 'Oswald, sans-serif',
          lineHeight: 1
        }}>{title || 'Dragons'}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {actions}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: '8px',
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '44px',
              background: 'white', borderRadius: '10px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              minWidth: '160px', overflow: 'hidden',
              border: '1px solid var(--gray-200)', zIndex: 200
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--black)' }}>
                  {userProfile?.firstName} {userProfile?.lastName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px' }}>
                  {userProfile?.role === 'coach' ? '⚾ Coach' : '👤 Parent'}
                </div>
              </div>
              <button onClick={() => { setMenuOpen(false); navigate('/dues'); }} style={{
                width: '100%', padding: '12px 16px', background: 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontSize: '14px', color: 'var(--gray-700)', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                💰 Dues
              </button>
              <button onClick={() => { setMenuOpen(false); handleLogout(); }} style={{
                width: '100%', padding: '12px 16px', background: 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontSize: '14px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                🚪 Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
