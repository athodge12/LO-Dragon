import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
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

  async function fetchUserProfile(uid) {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Backfill claimedPlayers from roster if not yet set
      if (!data.claimedPlayers) {
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
            data.claimedPlayers = claimed;
            await setDoc(docRef, { claimedPlayers: claimed }, { merge: true });
          }
        } catch {
          // Roster read failed — skip backfill
        }
      }
      setUserProfile(data);
      return data;
    }
    return null;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
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
