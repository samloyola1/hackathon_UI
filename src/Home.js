import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
import './SafetyDashboard.css';

const SAFETY_API_URL = process.env.REACT_APP_SAFETY_API_URL || 'http://localhost:8000';

const DASHBOARD_ENDPOINTS = [
  { key: 'safety', label: 'Safety', endpoint: '/api/safety-dashboard/reports' },
  { key: 'facility', label: 'Facility', endpoint: '/api/facility-dashboard/reports' },
  { key: 'pallet', label: 'Pallet', endpoint: '/api/pallet-dashboard/reports' },
  { key: 'supervisor', label: 'Supervisor', endpoint: '/api/supervisor-dashboard/reports' },
  { key: 'vehicle', label: 'Vehicle', endpoint: '/api/vehicle-dashboard/reports' },
];

function countAlerts(reports) {
  return reports.filter((r) => {
    const sub = Array.isArray(r?.sub_agent_results) && r.sub_agent_results.length > 0 ? r.sub_agent_results[0] : null;
    const alarm = Boolean(r?.alarm_triggered ?? (sub && sub.alarm_triggered));
    const urgency = r?.urgency || (sub && sub.urgency) || 'none';
    const eventType = r?.event_type;
    if (eventType === 'alert') return true;
    if (alarm || urgency === 'high') return true;
    return false;
  }).length;
}

const stats = [
  { label: 'Active Cameras',  value: '12',  tone: 'blue'  },
  { label: 'Open Alerts',     value: '3',   tone: 'red'   },
  { label: 'Incidents Today', value: '7',   tone: 'amber' },
  { label: 'System Health',   value: '98%', tone: 'green' },
];

const features = [
  { icon: 'cam',   title: 'Live Camera',        text: 'Monitor every zone in real time from a single feed.' },
  { icon: 'alert', title: 'Smart Alerts',       text: 'Severity-ranked notifications the moment something happens.' },
  { icon: 'clock', title: 'Incident Timeline',  text: 'A clear chronological record of every event.' },
  { icon: 'robot', title: 'AI Recommendations', text: 'Actionable next steps generated automatically.' },
];

const pages = [
  {
    icon: 'DASH',
    title: 'Dashboard',
    description: 'Live camera feed, alerts, incident timeline and AI recommendations all in one view.',
    path: '/dashboard',
    accent: '#1f6feb',
    tag: 'Live',
  },
  {
    icon: 'SAFE',
    title: 'Safety Agent',
    description: 'AI-powered safety monitoring with helmet and PPE detection on the live webcam.',
    path: '/safety',
    accent: '#f0883e',
    tag: 'AI',
  },
  {
    icon: 'NATS',
    title: 'NATS Monitor',
    description: 'Real-time NATS event stream viewer with agent routing, detection feed and connection details.',
    path: '/nats',
    accent: '#bc8cff',
    tag: 'Stream',
  },
  {
    icon: 'RPT',
    title: 'Safety Dashboard',
    description: 'Full safety report viewer with PPE compliance, violations, urgency levels and action tracking.',
    path: '/safety-dashboard',
    accent: '#3fb950',
    tag: 'Reports',
  },
  {
    icon: 'FAC',
    title: 'Facility Dashboard',
    description: 'Live facility reports from NATS with status, urgency, violations and action tracking.',
    path: '/facility-dashboard',
    accent: '#79c0ff',
    tag: 'Facility',
  },
  {
    icon: 'PAL',
    title: 'Pallet Dashboard',
    description: 'Pallet event reports streamed from NATS into the same operational dashboard layout.',
    path: '/pallet-dashboard',
    accent: '#ffa657',
    tag: 'Pallet',
  },
  {
    icon: 'SUP',
    title: 'Supervisor Dashboard',
    description: 'Supervisor-facing live reports with compliance, findings, recommendations and actions.',
    path: '/supervisor-dashboard',
    accent: '#bc8cff',
    tag: 'Supervisor',
  },
  {
    icon: 'VEH',
    title: 'Vehicle Dashboard',
    description: 'Vehicle report stream with the same live NATS-backed report visualization and detail view.',
    path: '/vehicle-dashboard',
    accent: '#f85149',
    tag: 'Vehicle',
  },
  {
    icon: 'CFG',
    title: 'Settings',
    description: 'Configure system preferences, camera sources, alert thresholds and integrations.',
    path: '/settings',
    accent: '#8b949e',
    tag: 'Config',
  },
];

const ICONS = {
  cam:   '📹',
  alert: '🚨',
  clock: '🕒',
  robot: '🤖',
  DASH:  '📊',
  SAFE:  '🛡️',
  NATS:  '📡',
  RPT:   '🛡️',
  FAC:   '🏭',
  PAL:   '📦',
  SUP:   '🧑‍💼',
  VEH:   '🚚',
  CFG:   '⚙️',
};

export default function Home() {
  const [alertSummary, setAlertSummary] = useState({});
  const [botDismissed, setBotDismissed] = useState(false);
  const prevTotalAlerts = useRef(0);
  const intervalRef = useRef(null);

  // Poll all dashboard endpoints for alert counts
  useEffect(() => {
    const pollAlerts = async () => {
      const results = {};
      await Promise.all(
        DASHBOARD_ENDPOINTS.map(async ({ key, endpoint }) => {
          try {
            const res = await fetch(`${SAFETY_API_URL}${endpoint}`, { cache: 'no-store' });
            if (!res.ok) { results[key] = 0; return; }
            const data = await res.json();
            results[key] = countAlerts(Array.isArray(data.reports) ? data.reports : []);
          } catch { results[key] = 0; }
        })
      );
      setAlertSummary(results);
    };
    pollAlerts();
    intervalRef.current = setInterval(pollAlerts, 3000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const totalAlerts = Object.values(alertSummary).reduce((s, v) => s + v, 0);
  const alertingDashboards = DASHBOARD_ENDPOINTS.filter((d) => (alertSummary[d.key] || 0) >= 3);
  const showBot = alertingDashboards.length > 0 && !botDismissed;

  // Speech synthesis when threshold crossed
  useEffect(() => {
    if (totalAlerts >= 3 && prevTotalAlerts.current < 3 && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const names = alertingDashboards.map((d) => d.label).join(', ');
      const utterance = new SpeechSynthesisUtterance(
        `Warning! You have ${totalAlerts} alerts across ${names} dashboards which need immediate attention!`
      );
      utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
      setBotDismissed(false);
    }
    prevTotalAlerts.current = totalAlerts;
  }, [totalAlerts, alertingDashboards]);

  return (
    <div className="home">

      {/* Android humanoid bot — floating, transparent, on home page */}
      {showBot && (
        <div className="android-overlay">
          <div className="android-container">
            <button className="android-close-btn" onClick={() => setBotDismissed(true)} title="Dismiss">✕</button>
            <svg viewBox="0 0 200 420" className="android-svg" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="100" cy="410" rx="60" ry="8" fill="#00000044" className="android-shadow" />
              <g className="android-leg-l">
                <rect x="62" y="290" width="22" height="60" rx="8" fill="#c8c8c8" stroke="#aaa" strokeWidth="0.8" />
                <rect x="60" y="340" width="26" height="14" rx="5" fill="#b0b0b0" />
                <ellipse cx="73" cy="356" rx="18" ry="7" fill="#999" />
              </g>
              <g className="android-leg-r">
                <rect x="116" y="290" width="22" height="60" rx="8" fill="#c8c8c8" stroke="#aaa" strokeWidth="0.8" />
                <rect x="114" y="340" width="26" height="14" rx="5" fill="#b0b0b0" />
                <ellipse cx="127" cy="356" rx="18" ry="7" fill="#999" />
              </g>
              <rect x="55" y="160" width="90" height="140" rx="20" fill="url(#hgTorso)" stroke="#bbb" strokeWidth="1" />
              <rect x="72" y="180" width="56" height="36" rx="8" fill="#1a1a2e" stroke="#333" strokeWidth="0.8" />
              <circle cx="100" cy="198" r="8" fill="#f85149" className="android-core" />
              <line x1="75" y1="228" x2="125" y2="228" stroke="#555" strokeWidth="0.5" />
              <line x1="75" y1="240" x2="125" y2="240" stroke="#555" strokeWidth="0.5" />
              <line x1="75" y1="252" x2="125" y2="252" stroke="#555" strokeWidth="0.5" />
              <g className="android-arm-l">
                <ellipse cx="46" cy="172" rx="12" ry="14" fill="#d0d0d0" />
                <rect x="34" y="182" width="20" height="56" rx="8" fill="#c0c0c0" stroke="#aaa" strokeWidth="0.8" />
                <rect x="30" y="236" width="16" height="14" rx="5" fill="#b8b8b8" />
                <circle cx="38" cy="258" r="10" fill="#ccc" stroke="#aaa" strokeWidth="0.5" />
                <rect x="30" y="266" width="5" height="10" rx="2" fill="#bbb" />
                <rect x="36" y="268" width="5" height="12" rx="2" fill="#bbb" />
                <rect x="42" y="266" width="5" height="10" rx="2" fill="#bbb" />
              </g>
              <g className="android-arm-r">
                <ellipse cx="154" cy="172" rx="12" ry="14" fill="#d0d0d0" />
                <rect x="146" y="182" width="20" height="56" rx="8" fill="#c0c0c0" stroke="#aaa" strokeWidth="0.8" />
                <rect x="154" y="236" width="16" height="14" rx="5" fill="#b8b8b8" />
                <circle cx="162" cy="258" r="10" fill="#ccc" stroke="#aaa" strokeWidth="0.5" />
                <rect x="155" y="266" width="5" height="10" rx="2" fill="#bbb" />
                <rect x="161" y="268" width="5" height="12" rx="2" fill="#bbb" />
                <rect x="167" y="266" width="5" height="10" rx="2" fill="#bbb" />
              </g>
              <rect x="88" y="138" width="24" height="26" rx="6" fill="#bbb" stroke="#aaa" strokeWidth="0.5" />
              <g className="android-head">
                <ellipse cx="100" cy="80" rx="46" ry="52" fill="url(#hgHead)" stroke="#bbb" strokeWidth="1.2" />
                <ellipse cx="100" cy="50" rx="28" ry="12" fill="#d8d8d8" />
                <ellipse cx="78" cy="78" rx="14" ry="12" fill="#1a1a2e" />
                <circle cx="78" cy="78" r="8" fill="#111" className="android-eye-l" />
                <circle cx="78" cy="76" r="3.5" fill="#58a6ff" className="android-pupil-l" />
                <circle cx="80" cy="74" r="1.5" fill="#fff" opacity="0.7" />
                <ellipse cx="122" cy="78" rx="14" ry="12" fill="#1a1a2e" />
                <circle cx="122" cy="78" r="8" fill="#111" className="android-eye-r" />
                <circle cx="122" cy="76" r="3.5" fill="#58a6ff" className="android-pupil-r" />
                <circle cx="124" cy="74" r="1.5" fill="#fff" opacity="0.7" />
                <rect x="82" y="102" width="36" height="10" rx="5" fill="#1a1a2e" stroke="#333" strokeWidth="0.5" />
                <rect x="86" y="104" width="28" height="6" rx="3" fill="#f85149" className="android-mouth" />
                <rect x="50" y="68" width="8" height="20" rx="4" fill="#c0c0c0" />
                <rect x="142" y="68" width="8" height="20" rx="4" fill="#c0c0c0" />
                <line x1="100" y1="28" x2="100" y2="10" stroke="#aaa" strokeWidth="2" />
                <circle cx="100" cy="8" r="4" fill="#f85149" className="android-antenna" />
              </g>
              <defs>
                <linearGradient id="hgHead" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0f0f0" />
                  <stop offset="100%" stopColor="#d0d0d0" />
                </linearGradient>
                <linearGradient id="hgTorso" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8e8e8" />
                  <stop offset="100%" stopColor="#c8c8c8" />
                </linearGradient>
              </defs>
            </svg>
            <div className="android-speech-bubble">
              <div className="android-speech-arrow" />
              <div>⚠️ <strong>{totalAlerts}</strong> alerts need immediate attention!</div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#ff7b72' }}>
                {alertingDashboards.map((d) => (
                  <span key={d.key} style={{ marginRight: 8 }}>🔴 {d.label}: {alertSummary[d.key]}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <section className="hero">
        <h1>Warehouse Monitoring System</h1>
        <p>Real-time monitoring and AI-assisted response, all in one place.</p>
        <Link to="/dashboard" className="cta">Open Dashboard</Link>
      </section>

      <section className="stats">
        {stats.map((s) => (
          <div key={s.label} className={`stat ${s.tone}`}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      <section className="nav-section">
        <h2 className="nav-section-title">Navigate to a Page</h2>
        <div className="nav-cards">
          {pages.map((p) => (
            <Link key={p.path} to={p.path} className="nav-card" style={{ '--accent': p.accent }}>
              <div className="nav-card-top">
                <span className="nav-card-icon">{ICONS[p.icon]}</span>
                <span className="nav-card-tag">{p.tag}</span>
              </div>
              <h3 className="nav-card-title">{p.title}</h3>
              <p className="nav-card-desc">{p.description}</p>
              <span className="nav-card-arrow">Go to {p.title} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="features">
        {features.map((f) => (
          <div key={f.title} className="feature">
            <span className="feature-icon">{ICONS[f.icon]}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
