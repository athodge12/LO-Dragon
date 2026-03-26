import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Layout/Header';
import Toast from '../../components/UI/Toast';

const ALL_ROLES = ['admin', 'coach', 'bookkeeper', 'parent', 'fan'];

const ROLE_META = {
  admin:      { emoji: '🛡️', color: '#7C3AED', bg: '#EDE9FE', desc: 'Full access + user management' },
  coach:      { emoji: '⚾', color: '#CC1B1B', bg: '#FEE2E2', desc: 'Edit roster, schedule, scores, stats' },
  bookkeeper: { emoji: '📒', color: '#1D4ED8', bg: '#DBEAFE', desc: 'Stats & live scoring' },
  parent:     { emoji: '👤', color: '#065F46', bg: '#D1FAE5', desc: 'RSVP, view team info' },
  fan:        { emoji: '🎉', color: '#92400E', bg: '#FEF3C7', desc: 'View only + Fan Zone chat' },
};

function getRoles(user) {
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  if (user.role) return [user.role];
  return [];
}

export default function Admin() {
  const { isAdmin, isCoach, currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editRoles, setEditRoles] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!isAdmin && !isCoach) navigate('/');
  }, [isAdmin, isCoach]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => {
        const roleOrder = { admin: 0, coach: 1, bookkeeper: 2, parent: 3, fan: 4 };
        const aTop = Math.min(...getRoles(a).map(r => roleOrder[r] ?? 5));
        const bTop = Math.min(...getRoles(b).map(r => roleOrder[r] ?? 5));
        return aTop - bTop;
      });
      setUsers(all);
    });
  }, []);

  const openEdit = (user) => {
    setEditUser(user);
    setEditRoles(getRoles(user));
  };

  const toggleRole = (role) => {
    setEditRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const saveRoles = async () => {
    if (!editUser || editRoles.length === 0) return;
    // primary role = admin > coach > bookkeeper > parent > fan
    const order = ['admin', 'coach', 'bookkeeper', 'parent', 'fan'];
    const primary = order.find(r => editRoles.includes(r)) || editRoles[0];
    await updateDoc(doc(db, 'users', editUser.id), {
      roles: editRoles,
      role: primary
    });
    setToast(`${displayName(editUser)} updated`);
    setEditUser(null);
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Remove ${displayName(user)}? This only removes their profile, not their login.`)) return;
    await deleteDoc(doc(db, 'users', user.id));
    setToast('User removed');
  };

  const displayName = (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown';

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      displayName(u).toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.childName?.toLowerCase().includes(q);
  });

  const counts = ALL_ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => getRoles(u).includes(r)).length;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Manage Users" back="/" />

      <div className="page-content">
        {/* Summary */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {ALL_ROLES.filter(r => counts[r] > 0).map(r => {
            const m = ROLE_META[r];
            return (
              <span key={r} style={{
                fontSize: '12px', fontWeight: '700', padding: '4px 10px',
                borderRadius: '20px', color: m.color, background: m.bg,
                textTransform: 'capitalize'
              }}>
                {m.emoji} {counts[r]} {r}{counts[r] !== 1 ? 's' : ''}
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
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          style={{ marginBottom: '14px' }}
        />

        {/* User list */}
        {filtered.length === 0 ? (
          <div className="empty-state"><p>No users found</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(user => {
              const roles = getRoles(user);
              const isMe = user.id === currentUser?.uid;
              const primaryMeta = ROLE_META[roles[0]] || ROLE_META.parent;
              return (
                <div key={user.id} style={{
                  background: 'white',
                  border: `1px solid ${isMe ? '#FECACA' : 'var(--gray-200)'}`,
                  borderRadius: '12px', padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: primaryMeta.bg, color: primaryMeta.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Oswald, sans-serif', fontWeight: '700', fontSize: '16px',
                      flexShrink: 0
                    }}>
                      {displayName(user)[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>
                        {displayName(user)} {isMe && <span style={{ fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic' }}>you</span>}
                      </div>
                      {user.email && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.email}
                        </div>
                      )}
                      {user.childName && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Parent of {user.childName}</div>
                      )}
                    </div>
                    {/* Role badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                      {roles.map(r => {
                        const m = ROLE_META[r] || {};
                        return (
                          <span key={r} style={{
                            fontSize: '10px', fontWeight: '700', padding: '2px 8px',
                            borderRadius: '20px', color: m.color, background: m.bg,
                            textTransform: 'capitalize', whiteSpace: 'nowrap'
                          }}>{m.emoji} {r}</span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Edit button */}
                  {!isMe && (isAdmin || (isCoach && !roles.includes('admin'))) && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => openEdit(user)}
                        style={{
                          flex: 1, padding: '7px', borderRadius: '8px', cursor: 'pointer',
                          border: '1.5px solid var(--gray-300)', background: 'var(--gray-50)',
                          fontWeight: '600', fontSize: '13px', color: 'var(--gray-700)'
                        }}
                      >Edit Roles</button>
                      {isAdmin && (
                        <button
                          onClick={() => removeUser(user)}
                          style={{
                            padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                            border: '1.5px solid #FECACA', background: '#FEF2F2',
                            fontWeight: '600', fontSize: '13px', color: 'var(--red)'
                          }}
                        >Remove</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Roles Modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              Edit Roles
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px' }}>
              {displayName(editUser)} — select all that apply
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {ALL_ROLES
                .filter(r => isAdmin || r !== 'admin')
                .map(r => {
                  const m = ROLE_META[r];
                  const checked = editRoles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                        border: `2px solid ${checked ? m.color : 'var(--gray-200)'}`,
                        background: checked ? m.bg : 'white', textAlign: 'left'
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: '6px', flexShrink: 0,
                        border: `2px solid ${checked ? m.color : 'var(--gray-300)'}`,
                        background: checked ? m.color : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {checked && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20,6 9,17 4,12"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: checked ? m.color : 'var(--gray-700)', textTransform: 'capitalize' }}>
                          {m.emoji} {r}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '1px' }}>{m.desc}</div>
                      </div>
                    </button>
                  );
                })}
            </div>

            {editRoles.includes('admin') && (
              <div style={{
                background: '#FEF3C7', border: '1px solid #FCD34D',
                borderRadius: '10px', padding: '10px 12px', marginBottom: '14px'
              }}>
                <p style={{ fontSize: '13px', color: '#92400E' }}>
                  ⚠️ Admin has full access including user management.
                </p>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={saveRoles}
              disabled={editRoles.length === 0}
            >
              Save Roles
            </button>
            <button className="btn-secondary" onClick={() => setEditUser(null)} style={{ marginTop: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  );
}
