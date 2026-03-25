import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import SuperAdminDashboard from './pages/superadmin/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import NewSurvey from './pages/admin/NewSurvey';
import SurveyResults from './pages/admin/SurveyResults';
import SurveyChat from './pages/public/SurveyChat';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<SurveyChat />} />

          <Route
            path="/superadmin/dashboard"
            element={
              <ProtectedRoute role="superadmin">
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/surveys/new"
            element={
              <ProtectedRoute role="admin">
                <NewSurvey />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/surveys/:id"
            element={
              <ProtectedRoute role="admin">
                <SurveyResults />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
