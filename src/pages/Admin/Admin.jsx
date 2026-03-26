import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const ROLES = ['admin', 'coach', 'bookkeeper', 'parent', 'fan'];

const ROLE_COLORS = {
  admin:      { color: '#7C3AED', bg: '#EDE9FE' },
  coach:      { color: '#CC1B1B', bg: '#FEE2E2' },
  bookkeeper: { color: '#1D4ED8', bg: '#DBEAFE' },
  parent:     { color: '#065F46', bg: '#D1FAE5' },
  fan:        { color: '#92400E', bg: '#FEF3C7' },
};

export default function Admin() {
  const { isAdmin, isCoach, currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { user, newRole }

  // Only admins and coaches can access this page
  useEffect(() => {
    if (!isAdmin && !isCoach) navigate('/');
  }, [isAdmin, isCoach]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => {
        const roleOrder = { admin: 0, coach: 1, bookkeeper: 2, parent: 3, fan: 4 };
        return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5);
      });
      setUsers(all);
    });
  }, []);

  const changeRole = async () => {
    if (!confirmModal) return;
    const { user, newRole } = confirmModal;
    await updateDoc(doc(db, 'users', user.id), { role: newRole });
    setToast(`${displayName(user)} is now ${newRole}`);
    setConfirmModal(null);
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Remove ${displayName(user)} from the app? This only removes their profile data, not their login.`)) return;
    await deleteDoc(doc(db, 'users', user.id));
    setToast('User removed');
  };

  const displayName = (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown';

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      displayName(u).toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.childName?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q);
  });

  const counts = ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="User Management" back="/" />

      <div className="page-content">
        {/* Summary chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {ROLES.filter(r => counts[r] > 0).map(r => {
            const c = ROLE_COLORS[r];
            return (
              <span key={r} style={{
                fontSize: '12px', fontWeight: '700', padding: '4px 10px',
                borderRadius: '20px', color: c.color, background: c.bg,
                textTransform: 'capitalize'
              }}>
                {counts[r]} {r}{counts[r] !== 1 ? 's' : ''}
              </span>
            );
          })}
          <span style={{
            fontSize: '12px', fontWeight: '700', padding: '4px 10px',
            borderRadius: '20px', color: 'var(--gray-600)', background: 'var(--gray-100)'
          }}>
            {users.length} total
          </span>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '14px' }}>
          <input
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or role..."
          />
        </div>

        {/* User list */}
        {filtered.length === 0 ? (
          <div className="empty-state"><p>No users found</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(user => {
              const c = ROLE_COLORS[user.role] || { color: 'var(--gray-600)', bg: 'var(--gray-100)' };
              const isMe = user.id === currentUser?.uid;
              return (
                <div key={user.id} style={{
                  background: 'white',
                  border: `1px solid ${isMe ? '#FECACA' : 'var(--gray-200)'}`,
                  borderRadius: '12px', padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: c.bg, color: c.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px',
                      flexShrink: 0
                    }}>
                      {displayName(user)[0]?.toUpperCase() || '?'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '15px' }}>
                          {displayName(user)}
                        </span>
                        {isMe && (
                          <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontStyle: 'italic' }}>you</span>
                        )}
                      </div>
                      {user.email && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.email}
                        </div>
                      )}
                      {user.childName && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '1px' }}>
                          Parent of {user.childName}
                        </div>
                      )}
                    </div>

                    {/* Role badge */}
                    <span style={{
                      fontSize: '11px', fontWeight: '700', padding: '3px 10px',
                      borderRadius: '20px', color: c.color, background: c.bg,
                      textTransform: 'capitalize', flexShrink: 0
                    }}>{user.role || 'unknown'}</span>
                  </div>

                  {/* Role change buttons — only show for non-self, and admins can change anyone, coaches can't change admins */}
                  {!isMe && (isAdmin || (isCoach && user.role !== 'admin')) && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--gray-100)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Change Role
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {ROLES
                          .filter(r => r !== user.role)
                          .filter(r => isAdmin || r !== 'admin') // coaches can't assign admin
                          .map(r => {
                            const rc = ROLE_COLORS[r];
                            return (
                              <button
                                key={r}
                                onClick={() => setConfirmModal({ user, newRole: r })}
                                style={{
                                  padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
                                  border: `1.5px solid ${rc.color}`,
                                  background: 'white', color: rc.color,
                                  fontSize: '12px', fontWeight: '700', textTransform: 'capitalize'
                                }}
                              >{r}</button>
                            );
                          })
                        }
                        {isAdmin && (
                          <button
                            onClick={() => removeUser(user)}
                            style={{
                              padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
                              border: '1.5px solid var(--gray-300)',
                              background: 'white', color: 'var(--gray-500)',
                              fontSize: '12px', fontWeight: '700', marginLeft: 'auto'
                            }}
                          >Remove</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm role change modal */}
      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '8px', textTransform: 'uppercase' }}>
              Change Role
            </h3>
            <p style={{ fontSize: '15px', color: 'var(--gray-600)', marginBottom: '20px', lineHeight: '1.5' }}>
              Change <strong>{displayName(confirmModal.user)}</strong> from{' '}
              <strong>{confirmModal.user.role}</strong> to{' '}
              <strong>{confirmModal.newRole}</strong>?
            </p>
            {confirmModal.newRole === 'admin' && (
              <div style={{
                background: '#FEF3C7', border: '1px solid #FCD34D',
                borderRadius: '10px', padding: '12px', marginBottom: '16px'
              }}>
                <p style={{ fontSize: '13px', color: '#92400E' }}>
                  ⚠️ Admin has full access to everything — user management, all editing, all features.
                </p>
              </div>
            )}
            <button className="btn-primary" onClick={changeRole}>Confirm Change</button>
            <button className="btn-secondary" onClick={() => setConfirmModal(null)} style={{ marginTop: '8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
