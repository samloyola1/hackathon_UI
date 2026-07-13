import { NavLink } from 'react-router-dom';
import './NavBar.css';

export default function NavBar() {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="nav-logo">⬢</span>
        Command Center
      </div>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Home
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Dashboard
        </NavLink>
        <NavLink to="/safety" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Safety Agent
        </NavLink>
        <NavLink to="/nats" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          NATS Monitor
        </NavLink>
        <NavLink to="/safety-dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Safety Dashboard
        </NavLink>
        <NavLink to="/facility-dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Facility Dashboard
        </NavLink>
        <NavLink to="/pallet-dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Pallet Dashboard
        </NavLink>
        <NavLink to="/supervisor-dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Supervisor Dashboard
        </NavLink>
        <NavLink to="/vehicle-dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Vehicle Dashboard
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
