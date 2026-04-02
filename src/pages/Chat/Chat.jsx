import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Layout/Header';

function PollMessage({ msg, currentUser, onVote, canAct, isCoach, pinnedId, onPin, onDelete }) {
  const votes = msg.votes || {};
  const totalVotes = msg.options.reduce((s, _, i) => s + (votes[i]?.length || 0), 0);
  const myVote = msg.options.findIndex((_, i) => (votes[i] || []).includes(currentUser?.uid));

  return (
    <div style={{
      background: 'white', border: '1.5px solid var(--gray-200)',
      borderRadius: '14px', padding: '14px', maxWidth: '300px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '16px' }}>📊</span>
        <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--black)', lineHeight: '1.3' }}>{msg.question}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {msg.options.map((opt, i) => {
          const count = votes[i]?.length || 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = myVote === i;
          return (
            <button key={i} onClick={() => onVote(msg, i)} style={{
              width: '100%', textAlign: 'left', border: `1.5px solid ${isMyVote ? 'var(--red)' : 'var(--gray-200)'}`,
              borderRadius: '8px', padding: '0', cursor: 'pointer', overflow: 'hidden',
              background: isMyVote ? '#FEF2F2' : 'var(--gray-50)', position: 'relative'
            }}>
              {totalVotes > 0 && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${pct}%`, background: isMyVote ? 'rgba(204,27,27,0.12)' : 'rgba(0,0,0,0.05)',
                  borderRadius: '6px', transition: 'width 0.3s'
                }} />
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px' }}>
                <span style={{ fontSize: '13px', fontWeight: isMyVote ? '700' : '500', color: isMyVote ? 'var(--red)' : 'var(--black)' }}>
                  {isMyVote ? '✓ ' : ''}{opt}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: '600' }}>
                  {totalVotes > 0 ? `${pct}%` : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '8px' }}>
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''} · {msg.authorName}
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        {isCoach && (
          <button onClick={() => onPin(msg)} style={{
            fontSize: '11px', color: pinnedId === msg.id ? 'var(--red)' : 'var(--gray-400)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600'
          }}>{pinnedId === msg.id ? '📌 Pinned' : '📌 Pin'}</button>
        )}
        {canAct && (
          <button onClick={() => onDelete(msg)} style={{
            fontSize: '11px', color: '#B91C1C', background: 'none',
            border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600'
          }}>Delete Poll</button>
        )}
      </div>
    </div>
  );
}

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

function MessageList({ messages, currentUser, isAdmin, isCoach, pinnedId, bottomRef, onDelete, onEdit, onVote, onPin }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = (msg) => {
    if (editText.trim() && editText.trim() !== msg.text) {
      onEdit(msg, editText.trim());
    }
    cancelEdit();
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
        const canAct = isMe || isAdmin;
        const isEditing = editingId === msg.id;

        if (msg.type === 'poll') {
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--red)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '700', fontFamily: 'Oswald, sans-serif', flexShrink: 0
              }}>{(msg.authorName || '?')[0].toUpperCase()}</div>
              <PollMessage msg={msg} currentUser={currentUser} onVote={onVote} canAct={isAdmin || msg.authorId === currentUser?.uid} isCoach={isCoach} pinnedId={pinnedId} onPin={onPin} onDelete={onDelete} />
            </div>
          );
        }

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
              }}>{(msg.authorName || '?')[0].toUpperCase()}</div>
            )}
            <div style={{ maxWidth: '75%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--gray-600)' }}>
                  {msg.authorName}
                </span>
                {!isMe && <RoleBadge role={msg.role} />}
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                    rows={2}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '12px',
                      border: '1.5px solid var(--red)', fontSize: '15px', resize: 'none',
                      outline: 'none', fontFamily: 'Source Sans 3, sans-serif',
                      lineHeight: '1.4', boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <button onClick={() => saveEdit(msg)} style={{
                      fontSize: '12px', fontWeight: '700', padding: '4px 10px',
                      borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: 'var(--red)', color: 'white'
                    }}>Save</button>
                    <button onClick={cancelEdit} style={{
                      fontSize: '12px', fontWeight: '600', padding: '4px 10px',
                      borderRadius: '8px', border: '1px solid var(--gray-200)',
                      cursor: 'pointer', background: 'white', color: 'var(--gray-500)'
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{
                    background: isMe ? 'var(--red)' : 'var(--gray-100)',
                    color: isMe ? 'white' : 'var(--black)',
                    padding: '10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: '15px', lineHeight: '1.4'
                  }}>
                    {msg.text}
                    {msg.edited && (
                      <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>(edited)</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{formatTime(msg.createdAt)}</span>
                    {isCoach && (
                      <button onClick={() => onPin(msg)} style={{
                        fontSize: '10px', color: pinnedId === msg.id ? 'var(--red)' : 'var(--gray-400)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600'
                      }}>{pinnedId === msg.id ? '📌 Pinned' : '📌 Pin'}</button>
                    )}
                    {canAct && (
                      <>
                        <button onClick={() => startEdit(msg)} style={{
                          fontSize: '10px', color: 'var(--gray-400)', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600'
                        }}>Edit</button>
                        <button onClick={() => onDelete(msg)} style={{
                          fontSize: '10px', color: '#B91C1C', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600'
                        }}>Delete</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export default function Chat() {
  const { currentUser, userProfile, isCoach, isFan, isActualAdmin, chatDisplayName } = useAuth();
  const [activeTab, setActiveTab] = useState(isFan ? 'fanzone' : 'team');
  const [teamMessages, setTeamMessages] = useState([]);
  const [fanMessages, setFanMessages] = useState([]);
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(null);
  const [pinnedText, setPinnedText] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinnedMsgId, setPinnedMsgId] = useState(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
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
      if (snap.exists() && snap.data().text) {
        setPinned(snap.data());
        setPinnedMsgId(snap.data().msgId || null);
      } else {
        setPinned(null);
        setPinnedMsgId(null);
      }
    }));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    setText('');
  }, [activeTab]);

  const sendMessage = async () => {
    if (!text.trim()) return;
    const col = activeTab === 'team' ? 'messages' : 'fanMessages';
    await addDoc(collection(db, col), {
      text: text.trim(),
      authorId: currentUser.uid,
      authorName: chatDisplayName,
      role: userProfile?.role || 'parent',
      createdAt: new Date().toISOString()
    });
    setText('');
  };

  const handleDelete = async (msg) => {
    const col = activeTab === 'team' ? 'messages' : 'fanMessages';
    await deleteDoc(doc(db, col, msg.id));
  };

  const handleEdit = async (msg, newText) => {
    const col = activeTab === 'team' ? 'messages' : 'fanMessages';
    await updateDoc(doc(db, col, msg.id), { text: newText, edited: true });
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

  const handlePin = async (msg) => {
    if (pinnedMsgId === msg.id) {
      await setDoc(doc(db, 'settings', 'pinnedMessage'), { text: '' });
      return;
    }
    const displayText = msg.type === 'poll'
      ? `📊 Poll: ${msg.question}`
      : msg.text;
    await setDoc(doc(db, 'settings', 'pinnedMessage'), {
      text: displayText,
      msgId: msg.id,
      authorName: msg.authorName,
      createdAt: new Date().toISOString()
    });
  };

  const createPoll = async () => {
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2) return;
    await addDoc(collection(db, 'messages'), {
      type: 'poll',
      question: pollQuestion.trim(),
      options: opts,
      votes: {},
      authorId: currentUser.uid,
      authorName: chatDisplayName,
      role: userProfile?.role || 'coach',
      createdAt: new Date().toISOString()
    });
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollModal(false);
  };

  const handleVote = async (msg, optionIdx) => {
    if (!currentUser) return;
    const votes = msg.votes || {};
    const newVotes = {};
    msg.options.forEach((_, i) => {
      newVotes[i] = (votes[i] || []).filter(uid => uid !== currentUser.uid);
    });
    const alreadyVoted = (votes[optionIdx] || []).includes(currentUser.uid);
    if (!alreadyVoted) newVotes[optionIdx] = [...newVotes[optionIdx], currentUser.uid];
    await updateDoc(doc(db, 'messages', msg.id), { votes: newVotes });
  };

  const currentMessages = activeTab === 'team' ? teamMessages : fanMessages;
  const placeholder = activeTab === 'fanzone' ? 'Cheer on the Dragons...' : 'Message the team...';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header title="Chat" back="/" />

      {/* Tabs — fixed below header so they're always visible */}
      <div style={{
        position: 'fixed', top: 'var(--header-height)', left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 'var(--max-width)', zIndex: 10,
        display: 'flex', borderBottom: '1px solid var(--gray-200)',
        background: 'white'
      }}>
        {!isFan && (
          <button onClick={() => setActiveTab('team')} style={{
            flex: 1, padding: '12px', border: 'none', background: 'none',
            cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: '14px',
            fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
            color: activeTab === 'team' ? 'var(--red)' : 'var(--gray-400)',
            borderBottom: activeTab === 'team' ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>Team Chat</button>
        )}
        <button onClick={() => setActiveTab('fanzone')} style={{
          flex: 1, padding: '12px', border: 'none', background: 'none',
          cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: '14px',
          fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px',
          color: activeTab === 'fanzone' ? 'var(--red)' : 'var(--gray-400)',
          borderBottom: activeTab === 'fanzone' ? '2px solid var(--red)' : '2px solid transparent',
          marginBottom: '-1px'
        }}>Fan Zone</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: '45px' }}>
        {/* Pinned message */}
        {activeTab === 'team' && pinned?.text && (
          <div style={{
            background: '#FFF5F5', borderBottom: '2px solid #FECACA',
            padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>📌</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                Pinned Message
              </div>
              <p style={{ fontSize: '13px', color: 'var(--black)', lineHeight: '1.4', wordBreak: 'break-word' }}>{pinned.text}</p>
              <p style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>— {pinned.authorName}</p>
            </div>
            {isCoach && (
              <button onClick={clearPinned} style={{
                background: 'none', border: 'none', color: 'var(--gray-400)',
                cursor: 'pointer', fontSize: '18px', flexShrink: 0, lineHeight: 1
              }}>×</button>
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

        <MessageList
          messages={currentMessages}
          currentUser={currentUser}
          isAdmin={isActualAdmin}
          isCoach={isCoach && activeTab === 'team'}
          pinnedId={pinnedMsgId}
          bottomRef={bottomRef}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onVote={handleVote}
          onPin={handlePin}
        />

        {/* Input */}
        <div style={{
          position: 'fixed', bottom: 'var(--bottom-nav-height)', left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: 'var(--max-width)', background: 'white',
          borderTop: '1px solid var(--gray-200)', padding: '10px 16px',
          display: 'flex', gap: '8px', alignItems: 'center',
          boxSizing: 'border-box'
        }}>
          {isCoach && activeTab === 'team' && (
            <button onClick={() => setShowPollModal(true)} title="Create Poll" style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: 'var(--gray-100)', border: '1.5px solid var(--gray-200)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px'
            }}>📊</button>
          )}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            placeholder={placeholder}
            rows={1}
            style={{
              flex: 1, padding: '12px 16px', border: '1.5px solid var(--gray-200)',
              borderRadius: '24px', fontSize: '15px', resize: 'none',
              maxHeight: '100px', lineHeight: '1.4', outline: 'none',
              fontFamily: 'Source Sans 3, sans-serif', background: 'var(--gray-100)'
            }}
          />
          <button onClick={sendMessage} disabled={!text.trim()} style={{
            width: 48, height: 48, borderRadius: '50%',
            background: text.trim() ? (activeTab === 'fanzone' ? '#065F46' : 'var(--red)') : 'var(--gray-200)',
            border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22,2 15,22 11,13 2,9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Poll Modal */}
      {showPollModal && (
        <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <h3 style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', marginBottom: '16px', textTransform: 'uppercase' }}>
              📊 Create Poll
            </h3>
            <div className="form-group">
              <label className="form-label">Question</label>
              <input className="form-input" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                placeholder="e.g. Which day works best for you?" autoFocus />
            </div>
            <label className="form-label">Options</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input className="form-input" style={{ flex: 1, marginBottom: 0 }} value={opt}
                    onChange={e => setPollOptions(o => o.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={`Option ${i + 1}`} />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(o => o.filter((_, j) => j !== i))} style={{
                      background: 'none', border: 'none', color: '#B91C1C',
                      cursor: 'pointer', fontSize: '20px', flexShrink: 0, lineHeight: 1
                    }}>×</button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 6 && (
              <button onClick={() => setPollOptions(o => [...o, ''])} style={{
                width: '100%', padding: '10px', borderRadius: '10px', cursor: 'pointer',
                background: 'transparent', border: '1.5px dashed var(--gray-300)',
                color: 'var(--gray-500)', fontWeight: '600', fontSize: '14px', marginBottom: '16px'
              }}>+ Add Option</button>
            )}
            <button className="btn-primary"
              onClick={createPoll}
              disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}>
              Post Poll
            </button>
          </div>
        </div>
      )}

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
