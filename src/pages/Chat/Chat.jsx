import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, setDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';

const ROLE_BADGE = {
  coach: { label: 'Coach', color: 'var(--red)', bg: '#FEE2E2' },
  bookkeeper: { label: 'Bookkeeper', color: '#7C3AED', bg: '#EDE9FE' },
  parent: { label: 'Parent', color: '#1D4ED8', bg: '#DBEAFE' },
  fan: { label: 'Fan', color: '#065F46', bg: '#D1FAE5' },
};

function RoleBadge({ role }) {
  const b = ROLE_BADGE[role];
  if (!b) return null;
  return (
    <span style={{
      fontSize: '10px', fontWeight: '700', padding: '1px 6px',
      borderRadius: '4px', color: b.color, background: b.bg,
      textTransform: 'uppercase', letterSpacing: '0.5px'
    }}>{b.label}</span>
  );
}

function MessageList({ messages, currentUser, bottomRef }) {
  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '16px',
      paddingBottom: '80px', display: 'flex', flexDirection: 'column', gap: '12px'
    }}>
      {messages.length === 0 && (
        <div className="empty-state" style={{ marginTop: '40px' }}>
          <p style={{ fontSize: '32px' }}>💬</p>
          <p>No messages yet. Be the first!</p>
        </div>
      )}
      {messages.map(msg => {
        const isMe = msg.authorId === currentUser?.uid;
        return (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: isMe ? 'row-reverse' : 'row',
            gap: '8px', alignItems: 'flex-end'
          }}>
            {!isMe && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: msg.role === 'coach' ? 'var(--red)' : msg.role === 'fan' ? '#065F46' : 'var(--gray-400)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '700', fontFamily: 'Oswald, sans-serif',
                flexShrink: 0
              }}>{msg.authorName?.[0]?.toUpperCase()}</div>
            )}
            <div style={{ maxWidth: '75%' }}>
              {!isMe && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--gray-600)' }}>
                    {msg.authorName}
                  </span>
                  <RoleBadge role={msg.role} />
                </div>
              )}
              <div style={{
                background: isMe ? 'var(--red)' : 'var(--gray-100)',
                color: isMe ? 'white' : 'var(--black)',
                padding: '10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: '15px', lineHeight: '1.4'
              }}>{msg.text}</div>
              <div style={{
                fontSize: '10px', color: 'var(--gray-400)', marginTop: '3px',
                textAlign: isMe ? 'right' : 'left'
              }}>{formatTime(msg.createdAt)}</div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export default function Chat() {
  const { currentUser, userProfile, isCoach, isFan } = useAuth();
  const [activeTab, setActiveTab] = useState(isFan ? 'fanzone' : 'team');
  const [teamMessages, setTeamMessages] = useState([]);
  const [fanMessages, setFanMessages] = useState([]);
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(null);
  const [pinnedText, setPinnedText] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsubs = [];
    const teamQ = query(collection(db, 'messages'), orderBy('createdAt'));
    unsubs.push(onSnapshot(teamQ, snap => {
      setTeamMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (activeTab === 'team') setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }));
    const fanQ = query(collection(db, 'fanMessages'), orderBy('createdAt'));
    unsubs.push(onSnapshot(fanQ, snap => {
      setFanMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (activeTab === 'fanzone') setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }));
    unsubs.push(onSnapshot(doc(db, 'settings', 'pinnedMessage'), snap => {
      if (snap.exists() && snap.data().text) setPinned(snap.data());
      else setPinned(null);
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    setText('');
  }, [activeTab]);

  const sendMessage = async () => {
    if (!text.trim()) return;
    const name = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim();
    const collection_name = activeTab === 'team' ? 'messages' : 'fanMessages';
    await addDoc(collection(db, collection_name), {
      text: text.trim(),
      authorId: currentUser.uid,
      authorName: name,
      role: userProfile?.role || 'parent',
      createdAt: new Date().toISOString()
    });
    setText('');
  };

  const postPinned = async () => {
    if (!pinnedText.trim()) return;
    await setDoc(doc(db, 'settings', 'pinnedMessage'), {
      text: pinnedText,
      authorName: `${userProfile?.firstName} ${userProfile?.lastName}`,
      createdAt: new Date().toISOString()
    });
    setPinnedText('');
    setShowPinModal(false);
  };

  const clearPinned = async () => {
    await setDoc(doc(db, 'settings', 'pinnedMessage'), { text: '' });
  };

  const currentMessages = activeTab === 'team' ? teamMessages : fanMessages;
  const placeholder = activeTab === 'fanzone'
    ? 'Cheer on the Dragons...'
    : 'Message the team...';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Chat" back="/" actions={isCoach && activeTab === 'team' && (
        <button onClick={() => setShowPinModal(true)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', cursor: 'pointer', fontSize: '16px'
        }}>📌</button>
      )} />

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--gray-200)',
        background: 'white', flexShrink: 0
      }}>
        {!isFan && (
          <button
            onClick={() => setActiveTab('team')}
            style={{
              flex: 1, padding: '12px', border: 'none', background: 'none',
              cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: '14px',
              fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
              color: activeTab === 'team' ? 'var(--red)' : 'var(--gray-400)',
              borderBottom: activeTab === 'team' ? '2px solid var(--red)' : '2px solid transparent',
              marginBottom: '-1px'
            }}
          >
            Team Chat
          </button>
        )}
        <button
          onClick={() => setActiveTab('fanzone')}
          style={{
            flex: 1, padding: '12px', border: 'none', background: 'none',
            cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: '14px',
            fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
            color: activeTab === 'fanzone' ? 'var(--red)' : 'var(--gray-400)',
            borderBottom: activeTab === 'fanzone' ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: '-1px'
          }}
        >
          Fan Zone
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Pinned announcement — team chat only */}
        {activeTab === 'team' && pinned?.text && (
          <div style={{
            background: '#FFF5F5', borderBottom: '1px solid #FECACA',
            padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '14px' }}>📌</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', color: 'var(--black)', lineHeight: '1.4' }}>{pinned.text}</p>
              <p style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>{pinned.authorName}</p>
            </div>
            {isCoach && (
              <button onClick={clearPinned} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '16px' }}>×</button>
            )}
          </div>
        )}

        {/* Fan Zone banner */}
        {activeTab === 'fanzone' && (
          <div style={{
            background: 'linear-gradient(135deg, #065F46, #047857)',
            padding: '10px 16px', textAlign: 'center'
          }}>
            <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.5px' }}>
              Fan Zone — Cheer on the Dragons!
            </p>
          </div>
        )}

        <MessageList messages={currentMessages} currentUser={currentUser} bottomRef={bottomRef} />

        {/* Input */}
        <div style={{
          position: 'fixed', bottom: 'var(--bottom-nav-height)', left: 0,
          width: '100%', maxWidth: 'var(--max-width)', background: 'white',
          borderTop: '1px solid var(--gray-200)', padding: '10px 16px',
          display: 'flex', gap: '8px', alignItems: 'flex-end',
          boxSizing: 'border-box'
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            placeholder={placeholder}
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', border: '1.5px solid var(--gray-200)',
              borderRadius: '20px', fontSize: '15px', resize: 'none',
              maxHeight: '100px', lineHeight: '1.4', outline: 'none', fontFamily: 'Source Sans 3, sans-serif'
            }}
          />
          <button onClick={sendMessage} disabled={!text.trim()} style={{
            width: 40, height: 40, borderRadius: '50%',
            background: text.trim() ? (activeTab === 'fanzone' ? '#065F46' : 'var(--red)') : 'var(--gray-200)',
            border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22,2 15,22 11,13 2,9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Pin Modal */}
      {showPinModal && (
        <div className="modal-overlay" onClick={() => setShowPinModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Pin Announcement
            </h3>
            <div className="form-group">
              <label className="form-label">Announcement Text</label>
              <textarea className="form-input" value={pinnedText} onChange={e => setPinnedText(e.target.value)} placeholder="Important team announcement..." rows={3} style={{ resize: 'none' }} />
            </div>
            <button className="btn-primary" onClick={postPinned}>Pin Announcement</button>
          </div>
        </div>
      )}
    </div>
  );
}
