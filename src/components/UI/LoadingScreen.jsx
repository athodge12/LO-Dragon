import DragonLogo from './DragonLogo';

export default function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #CC1B1B 0%, #8B0000 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      zIndex: 9999
    }}>
      <div style={{ textAlign: 'center' }}>
        <DragonLogo width={140} style={{ marginBottom: '8px' }} />
        <h1 style={{
          color: 'white',
          fontSize: '32px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '3px',
          fontFamily: 'Oswald, sans-serif'
        }}>Dragons</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginTop: '4px' }}>
          U8 Baseball
        </p>
      </div>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.3)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
