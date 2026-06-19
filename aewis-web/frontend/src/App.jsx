import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useStore from './store';
import Dashboard from './pages/Dashboard';
import GasDetail from './pages/GasDetail';
import History from './pages/History';
import Alerts from './pages/Alerts';
import Devices from './pages/Devices';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';
import NavBar from './components/NavBar';
import ErrorBoundary from './components/ErrorBoundary';

function RequireAuth({ children }) {
  const token = useStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function Layout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
          <Route path="/gas/:gasKey" element={<RequireAuth><Layout><GasDetail /></Layout></RequireAuth>} />
          <Route path="/history" element={<RequireAuth><Layout><History /></Layout></RequireAuth>} />
          <Route path="/alerts" element={<RequireAuth><Layout><Alerts /></Layout></RequireAuth>} />
          <Route path="/devices" element={<RequireAuth><Layout><Devices /></Layout></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Layout><Settings /></Layout></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
