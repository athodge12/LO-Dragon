import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import LoadingScreen from '../components/UI/LoadingScreen';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [rosterClaims, setRosterClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewRole, setPreviewRoleState] = useState(() => sessionStorage.getItem('previewRole') || null);

  const setPreviewRole = (role) => {
    if (role) sessionStorage.setItem('previewRole', role);
    else sessionStorage.removeItem('previewRole');
    setPreviewRoleState(role);
  };

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
    setPreviewRole(null);
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
      return `${playerFirst}'s ${cp.relationship}`;
    }).join(' · ');
    return `${firstName || fullName} (${claims})`;
  };

  // When previewing, override all role checks with the preview role
  const trueIsAdmin = userProfile?.roles?.includes('admin') || userProfile?.role === 'admin';
  const effectiveRole = previewRole;

  const value = {
    currentUser,
    userProfile,
    setUserProfile,
    register,
    login,
    logout,
    fetchUserProfile,
    chatDisplayName: getChatDisplayName(),
    previewRole,
    setPreviewRole,
    isActualAdmin: trueIsAdmin,
    isAdmin: effectiveRole ? effectiveRole === 'admin' : trueIsAdmin,
    isCoach: effectiveRole
      ? effectiveRole === 'coach' || effectiveRole === 'admin'
      : (userProfile?.roles?.includes('coach') || userProfile?.role === 'coach' ||
         userProfile?.roles?.includes('admin') || userProfile?.role === 'admin'),
    isBookkeeper: effectiveRole
      ? effectiveRole === 'bookkeeper' || effectiveRole === 'admin'
      : (userProfile?.roles?.includes('bookkeeper') || userProfile?.role === 'bookkeeper' ||
         userProfile?.roles?.includes('admin') || userProfile?.role === 'admin'),
    isFan: effectiveRole
      ? effectiveRole === 'fan'
      : ((userProfile?.roles?.includes('fan') || userProfile?.role === 'fan') &&
         !userProfile?.roles?.includes('admin') && userProfile?.role !== 'admin' &&
         !userProfile?.roles?.includes('coach') && userProfile?.role !== 'coach'),
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
}
