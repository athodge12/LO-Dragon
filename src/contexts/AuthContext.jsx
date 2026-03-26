import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
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

  // Kept for backward compatibility — onSnapshot handles live updates automatically
  async function fetchUserProfile(uid) {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      setUserProfile(docSnap.data());
      return docSnap.data();
    }
    return null;
  }

  useEffect(() => {
    let profileUnsub = null;

    const backfillClaimed = async (uid, docRef) => {
      try {
        const rosterSnap = await getDocs(collection(db, 'roster'));
        const claimed = [];
        rosterSnap.forEach(d => {
          const player = d.data();
          const cb = player.claimedBy;
          if (cb && typeof cb === 'object' && cb[uid]) {
            const entry = cb[uid];
            claimed.push({
              playerId: d.id,
              playerName: player.name || '',
              relationship: typeof entry === 'object' ? entry.relationship || '' : ''
            });
          }
        });
        if (claimed.length > 0) {
          // Writing triggers the onSnapshot listener to fire again with updated data
          await setDoc(docRef, { claimedPlayers: claimed }, { merge: true });
        }
      } catch {
        // Roster read failed — skip backfill
      }
    };

    const authUnsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (user) {
        const docRef = doc(db, 'users', user.uid);
        let backfillRan = false;

        profileUnsub = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            // Run backfill once if claimedPlayers missing (for users who claimed before this feature)
            if (!data.claimedPlayers && !backfillRan) {
              backfillRan = true;
              backfillClaimed(user.uid, docRef);
            }
            setUserProfile(data);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const getChatDisplayName = () => {
    const firstName = userProfile?.firstName || '';
    const lastName = userProfile?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim()
      || userProfile?.email?.split('@')[0]
      || currentUser?.email?.split('@')[0]
      || 'Team Member';
    if (!userProfile?.claimedPlayers?.length) return fullName;
    const claims = userProfile.claimedPlayers.map(cp => {
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
