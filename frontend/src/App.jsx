import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import ContractorPortal from './pages/ContractorPortal';
import BookingFlow from './pages/BookingFlow';
import CancelPage from './pages/CancelPage';
import ContractorApply from './pages/ContractorApply';
import LeadIntakeWidget from './pages/LeadIntakeWidget';
import LandingPage from './pages/LandingPage';

function ProtectedRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <img src="/probook-icon-128.png" alt="ProBook" className="w-16 h-16 rounded-2xl" />
        </div>
        <h1 className="text-5xl font-black text-gray-900 mb-2">404</h1>
        <p className="text-gray-500 mb-6">This page doesn't exist.</p>
        <button onClick={() => navigate('/')} className="btn-primary">Go Home</button>
      </div>
    </div>
  );
}

export default function App() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book/:token" element={<BookingFlow />} />
      <Route path="/cancel/:token" element={<CancelPage mode="cancel" />} />
      <Route path="/reschedule/:token" element={<CancelPage mode="reschedule" />} />
      <Route path="/get-quote" element={<LeadIntakeWidget />} />
      <Route path="/apply" element={<ContractorApply />} />

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

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
