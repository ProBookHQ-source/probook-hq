import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import ContractorPortal from './pages/ContractorPortal';
import BookingFlow from './pages/BookingFlow';
import LeadIntakeWidget from './pages/LeadIntakeWidget';
import LandingPage from './pages/LandingPage';

function ProtectedRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book/:token" element={<BookingFlow />} />
      <Route path="/get-quote" element={<LeadIntakeWidget />} />

      <Route path="/admin/*" element={
        <ProtectedRoute role="admin">
          <AdminDashboard />
        </ProtectedRoute>
      } />

      <Route path="/contractor/*" element={
        <ProtectedRoute role="contractor">
          <ContractorPortal />
        </ProtectedRoute>
      } />

      <Route path="/" element={
        user?.role === 'admin' ? <Navigate to="/admin" replace /> :
        user?.role === 'contractor' ? <Navigate to="/contractor" replace /> :
        <LandingPage />
      } />
    </Routes>
  );
}
