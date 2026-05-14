import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useNotifications } from './hooks/useNotifications';
import LoadingScreen from './components/UI/LoadingScreen';
import BottomNav from './components/Layout/BottomNav';
import './index.css';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(err) { return { error: err }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', fontFamily: 'monospace', fontSize: '13px', background: '#fff1f2', minHeight: '100vh' }}>
          <div style={{ fontWeight: '700', fontSize: '16px', color: '#b91c1c', marginBottom: '12px' }}>
            App Error — please screenshot and send to your developer:
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1f2937', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: '16px', padding: '10px 20px', background: '#cc1b1b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
import Snacks from './pages/Snacks/Snacks';
import Awards from './pages/Awards/Awards';
import Attendance from './pages/Attendance/Attendance';
import Admin from './pages/Admin/Admin';

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
  const { currentUser } = useAuth();
  const location = useLocation();
  const showNav = !HIDE_NAV_PATHS.includes(location.pathname);
  useNotifications(currentUser);

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
        <Route path="/snacks" element={<PrivateRoute><Snacks /></PrivateRoute>} />
        <Route path="/awards" element={<PrivateRoute><Awards /></PrivateRoute>} />
        <Route path="/attendance" element={<PrivateRoute><Attendance /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
