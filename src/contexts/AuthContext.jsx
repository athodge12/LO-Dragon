import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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
      setUserProfile(docSnap.data());
      return docSnap.data();
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

  const value = {
    currentUser,
    userProfile,
    setUserProfile,
    register,
    login,
    logout,
    fetchUserProfile,
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
