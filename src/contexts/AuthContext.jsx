import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rosterClaims, setRosterClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  async function register(email, password, profileData) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', result.user.uid), {
      ...profileData,
      email,
      uid: result.user.uid,
      createdAt: new Date().toISOString()
    });
    return result;
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  async function fetchUserProfile(uid) {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      setUserProfile(docSnap.data());
      return docSnap.data();
    }
    return null;
  }

  // Listen to user profile in real time
  useEffect(() => {
    let profileUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (user) {
        profileUnsub = onSnapshot(
          doc(db, 'users', user.uid),
          (snap) => {
            setUserProfile(snap.exists() ? snap.data() : null);
            setLoading(false);
          },
          () => {
            // Permission error — fall back to getDoc
            fetchUserProfile(user.uid).finally(() => setLoading(false));
          }
        );
      } else {
        setUserProfile(null);
        setRosterClaims([]);
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  // Listen to roster to always know which players this user has claimed
  useEffect(() => {
    if (!currentUser) { setRosterClaims([]); return; }

    const unsub = onSnapshot(
      collection(db, 'roster'),
      (snap) => {
        const claims = [];
        snap.forEach(d => {
          const player = d.data();
          const cb = player.claimedBy;
          if (cb && typeof cb === 'object' && cb[currentUser.uid]) {
            const entry = cb[currentUser.uid];
            claims.push({
              playerName: player.name || '',
              relationship: typeof entry === 'object' ? entry.relationship || '' : ''
            });
          }
        });
        setRosterClaims(claims);
      },
      () => setRosterClaims([]) // ignore errors — just show no claims
    );

    return unsub;
  }, [currentUser?.uid]);

  const getChatDisplayName = () => {
    const firstName = userProfile?.firstName || '';
    const lastName = userProfile?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim()
      || userProfile?.email?.split('@')[0]
      || currentUser?.email?.split('@')[0]
      || 'Team Member';
    if (!rosterClaims.length) return fullName;
    const claims = rosterClaims.map(cp => {
      const playerFirst = cp.playerName?.split(' ')[0] || cp.playerName || '';
      return `${cp.relationship} of ${playerFirst}`;
    }).join(' · ');
    return `${firstName || fullName} (${claims})`;
  };

  const value = {
    currentUser,
    userProfile,
    setUserProfile,
    register,
    login,
    logout,
    fetchUserProfile,
    chatDisplayName: getChatDisplayName(),
    isAdmin: userProfile?.roles?.includes('admin') || userProfile?.role === 'admin',
    isCoach: userProfile?.roles?.includes('coach') || userProfile?.role === 'coach' ||
             userProfile?.roles?.includes('admin') || userProfile?.role === 'admin',
    isBookkeeper: userProfile?.roles?.includes('bookkeeper') || userProfile?.role === 'bookkeeper' ||
                  userProfile?.roles?.includes('admin') || userProfile?.role === 'admin',
    isFan: (userProfile?.roles?.includes('fan') || userProfile?.role === 'fan') &&
           !userProfile?.roles?.includes('admin') && userProfile?.role !== 'admin' &&
           !userProfile?.roles?.includes('coach') && userProfile?.role !== 'coach',
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
