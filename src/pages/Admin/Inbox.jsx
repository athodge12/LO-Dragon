import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';

const TYPE_META = {
  support:    { label: 'Support',    emoji: '🛟', color: '#1D4ED8', bg: '#DBEAFE' },
  suggestion: { label: 'Suggestion', emoji: '💡', color: '#92400E', bg: '#FEF3C7' }
};

const STATUS_META = {
  open:    { label: 'Open',    color: '#CC1B1B', bg: '#FEE2E2' },
  replied: { label: 'Replied', color: '#065F46', bg: '#D1FAE5' }
};

export default function Inbox({ setToast }) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all'); // all | open | replied
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'inbox'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const openMessage = (msg) => {
    setSelected(msg);
    setReplyText(msg.reply || '');
  };

  const saveReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSaving(true);
    await updateDoc(doc(db, 'inbox', selected.id), {
      reply: replyText.trim(),
      status: 'replied',
      repliedAt: new Date().toISOString()
    });
    setSaving(false);
    setToast('Reply saved!');
    setSelected(null);
  };

  const markOpen = async (id) => {
    await updateDoc(doc(db, 'inbox', id), { status: 'open', reply: '', repliedAt: null });
    setToast('Marked as open.');
  };

  const deleteMessage = async (id) => {
    await deleteDoc(doc(db, 'inbox', id));
    setSelected(null);
    setToast('Message deleted.');
  };

  const filtered = messages.filter(m => filter === 'all' || m.status === filter);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {['all', 'open', 'replied'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer',
            border: `1.5px solid ${filter === f ? 'var(--red)' : 'var(--gray-200)'}`,
            background: filter === f ? '#FEF2F2' : 'white',
            color: filter === f ? 'var(--red)' : 'var(--gray-500)',
            textTransform: 'capitalize'
          }}>
            {f === 'all' ? `All (${messages.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${messages.filter(m => m.status === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{filter === 'open' ? 'No open messages' : filter === 'replied' ? 'No replied messages' : 'No messages yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(msg => {
            const type = TYPE_META[msg.type] || TYPE_META.support;
            const status = STATUS_META[msg.status] || STATUS_META.open;
            return (
              <div key={msg.id} onClick={() => openMessage(msg)} style={{
                background: msg.status === 'open' ? 'white' : 'var(--gray-50)',
                border: `1px solid ${msg.status === 'open' ? '#FECACA' : 'var(--gray-200)'}`,
                borderRadius: '12px', padding: '14px',
                cursor: 'pointer', transition: 'all 0.15s'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                      color: type.color, background: type.bg
                    }}>{type.emoji} {type.label}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                      color: status.color, background: status.bg
                    }}>{status.label}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--gray-400)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatDate(msg.createdAt)}
                  </span>
                </div>
                <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '3px' }}>{msg.subject}</div>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '4px' }}>
                  From: {msg.authorName}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: '1.4',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                }}>
                  {msg.message}
                </div>
                {msg.reply && (
                  <div style={{
                    marginTop: '8px', padding: '8px 10px',
                    background: '#D1FAE5', borderRadius: '8px',
                    fontSize: '12px', color: '#065F46', fontWeight: '600'
                  }}>
                    ↩ {msg.reply}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Message Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {(() => {
                const type = TYPE_META[selected.type] || TYPE_META.support;
                const status = STATUS_META[selected.status] || STATUS_META.open;
                return (
                  <>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '10px', color: type.color, background: type.bg }}>
                      {type.emoji} {type.label}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '10px', color: status.color, background: status.bg }}>
                      {status.label}
                    </span>
                  </>
                );
              })()}
            </div>

            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '4px', textTransform: 'uppercase' }}>
              {selected.subject}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '14px' }}>
              From: <strong>{selected.authorName}</strong> · {selected.authorEmail} · {formatDate(selected.createdAt)}
            </div>

            <div style={{
              background: 'var(--gray-50)', borderRadius: '10px', padding: '14px',
              fontSize: '14px', lineHeight: '1.6', color: 'var(--gray-700)', marginBottom: '16px'
            }}>
              {selected.message}
            </div>

            <div className="form-group">
              <label className="form-label">Your Reply</label>
              <textarea
                className="form-input"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type your reply here..."
                rows={4}
                style={{ resize: 'none' }}
              />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '12px', lineHeight: '1.4' }}>
              The sender will see your reply the next time they submit a message or check the app.
            </p>

            <button className="btn-primary" onClick={saveReply} disabled={saving || !replyText.trim()}>
              {saving ? 'Saving...' : 'Send Reply'}
            </button>
            {selected.status === 'replied' && (
              <button className="btn-secondary" onClick={() => { markOpen(selected.id); setSelected(null); }} style={{ marginTop: '8px' }}>
                Mark as Open
              </button>
            )}
            <button className="btn-secondary" onClick={() => setSelected(null)} style={{ marginTop: '8px' }}>
              Close
            </button>
            <button onClick={() => deleteMessage(selected.id)} style={{
              marginTop: '8px', width: '100%', padding: '12px',
              border: '1.5px solid #FECACA', borderRadius: '10px',
              background: '#FEF2F2', color: 'var(--red)',
              fontWeight: '600', fontSize: '14px', cursor: 'pointer'
            }}>
              🗑 Delete Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
