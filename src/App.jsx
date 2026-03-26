import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoadingScreen from './components/UI/LoadingScreen';
import BottomNav from './components/Layout/BottomNav';
import './index.css';

import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Home from './pages/Home/Home';
import Roster from './pages/Roster/Roster';
import PlayerProfile from './pages/Roster/PlayerProfile';
import Schedule from './pages/Schedule/Schedule';
import Practice from './pages/Practice/Practice';
import Stats from './pages/Stats/Stats';
import Chat from './pages/Chat/Chat';
import BattingOrder from './pages/BattingOrder/BattingOrder';
import DefensiveRotation from './pages/DefensiveRotation/DefensiveRotation';
import LiveScoring from './pages/LiveScoring/LiveScoring';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  if (currentUser === undefined) return <LoadingScreen />;
  return currentUser ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  if (currentUser === undefined) return <LoadingScreen />;
  return currentUser ? <Navigate to="/" replace /> : children;
}

const HIDE_NAV_PATHS = ['/login', '/register'];

function AppContent() {
  const location = useLocation();
  const showNav = !HIDE_NAV_PATHS.includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
        <Route path="/roster" element={<PrivateRoute><Roster /></PrivateRoute>} />
        <Route path="/roster/:id" element={<PrivateRoute><PlayerProfile /></PrivateRoute>} />
        <Route path="/schedule" element={<PrivateRoute><Schedule /></PrivateRoute>} />
        <Route path="/practice" element={<PrivateRoute><Practice /></PrivateRoute>} />
        <Route path="/stats" element={<PrivateRoute><Stats /></PrivateRoute>} />
        <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
        <Route path="/batting-order" element={<PrivateRoute><BattingOrder /></PrivateRoute>} />
        <Route path="/defensive-rotation" element={<PrivateRoute><DefensiveRotation /></PrivateRoute>} />
        <Route path="/live-scoring" element={<PrivateRoute><LiveScoring /></PrivateRoute>} />
<Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
