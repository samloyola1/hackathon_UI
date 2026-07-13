import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { SettingsProvider } from './SettingsContext';
import NavBar from './NavBar';
import Home from './Home';
import Dashboard from './Dashboard';
import SafetyAgent from './SafetyAgent';
import Settings from './Settings';
import NatsMonitor from './NatsMonitor';
import SafetyDashboard from './SafetyDashboard';
import FacilityDashboard from './FacilityDashboard';
import PalletDashboard from './PalletDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import VehicleDashboard from './VehicleDashboard';

function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/safety" element={<SafetyAgent />} />
          <Route path="/nats" element={<NatsMonitor />} />
          <Route path="/safety-dashboard" element={<SafetyDashboard />} />
          <Route path="/facility-dashboard" element={<FacilityDashboard />} />
          <Route path="/pallet-dashboard" element={<PalletDashboard />} />
          <Route path="/supervisor-dashboard" element={<SupervisorDashboard />} />
          <Route path="/vehicle-dashboard" element={<VehicleDashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  );
}

export default App;
