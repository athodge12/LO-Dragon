import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

export default function Header({ title, back, actions }) {
  const { logout, userProfile, currentUser, isAdmin, isCoach, chatDisplayName } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null); // 'support' | 'suggestion'
  const [form, setForm] = useState({ subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const openModal = (type) => {
    setMenuOpen(false);
    setForm({ subject: '', message: '' });
    setSent(false);
    setModal(type);
  };

  const submitInbox = async () => {
    if (!form.subject.trim() || !form.message.trim()) return;
    setSubmitting(true);
    await addDoc(collection(db, 'inbox'), {
      type: modal,
      subject: form.subject.trim(),
      message: form.message.trim(),
      authorName: chatDisplayName || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'Unknown',
      authorUid: currentUser?.uid || '',
      authorEmail: currentUser?.email || '',
      createdAt: new Date().toISOString(),
      status: 'open',
      reply: ''
    });
    setSubmitting(false);
    setSent(true);
  };

  const menuItemStyle = {
    width: '100%', padding: '12px 16px', background: 'none',
    border: 'none', cursor: 'pointer', textAlign: 'left',
    fontSize: '14px', color: 'var(--gray-700)',
    display: 'flex', alignItems: 'center', gap: '8px',
    borderBottom: '1px solid var(--gray-100)'
  };

  return (
    <>
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
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setMenuOpen(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: '44px',
                  background: 'white', borderRadius: '10px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  minWidth: '200px', overflow: 'hidden',
                  border: '1px solid var(--gray-200)', zIndex: 200
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--black)' }}>
                      {userProfile?.firstName} {userProfile?.lastName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px' }}>
                      {(Array.isArray(userProfile?.roles) ? userProfile.roles : [userProfile?.role]).filter(Boolean).map(r => ({admin:'🛡️ Admin',coach:'⚾ Coach',bookkeeper:'📒 Bookkeeper',parent:'👤 Parent',fan:'🎉 Fan'}[r] || r)).join(' · ')}
                    </div>
                  </div>
                  {(isAdmin || isCoach) && (
                    <button onClick={() => { setMenuOpen(false); navigate('/admin'); }} style={menuItemStyle}>
                      🛡️ Manage Users
                    </button>
                  )}
                  <button onClick={() => openModal('support')} style={menuItemStyle}>
                    🛟 Contact Support
                  </button>
                  <button onClick={() => openModal('suggestion')} style={menuItemStyle}>
                    💡 Submit Suggestion
                  </button>
                  <button onClick={() => { setMenuOpen(false); handleLogout(); }} style={{
                    ...menuItemStyle, borderBottom: 'none', color: 'var(--red)'
                  }}>
                    🚪 Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Support / Suggestion Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                  {modal === 'support' ? '✅' : '🙌'}
                </div>
                <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px', textTransform: 'uppercase' }}>
                  {modal === 'support' ? 'Message Sent!' : 'Thanks for the Idea!'}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--gray-500)', lineHeight: '1.5', marginBottom: '20px' }}>
                  {modal === 'support'
                    ? "We'll get back to you in the app as soon as possible."
                    : "We'll review your suggestion and get back to you."}
                </p>
                <button className="btn-primary" onClick={() => setModal(null)}>Done</button>
              </div>
            ) : (
              <>
                <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '6px', textTransform: 'uppercase' }}>
                  {modal === 'support' ? '🛟 Contact Support' : '💡 Submit Suggestion'}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: '1.5' }}>
                  {modal === 'support'
                    ? 'Having a problem or need help? Send us a message and we\'ll respond in the app.'
                    : 'Have an idea to improve the app? We\'d love to hear it!'}
                </p>
                <div className="form-group">
                  <label className="form-label">
                    {modal === 'support' ? 'What do you need help with?' : 'What\'s your idea about?'}
                  </label>
                  <input
                    className="form-input"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder={modal === 'support' ? 'e.g. I can\'t find the roster' : 'e.g. Notification improvements'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {modal === 'support' ? 'Describe the issue' : 'Tell us your idea'}
                  </label>
                  <textarea
                    className="form-input"
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder={modal === 'support'
                      ? 'What were you trying to do? What happened instead?'
                      : 'Describe your suggestion in detail...'}
                    rows={4}
                    style={{ resize: 'none' }}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={submitInbox}
                  disabled={submitting || !form.subject.trim() || !form.message.trim()}
                >
                  {submitting ? 'Sending...' : 'Send'}
                </button>
                <button className="btn-secondary" onClick={() => setModal(null)} style={{ marginTop: '8px' }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
