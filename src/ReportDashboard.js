import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './SafetyDashboard.css';

const SAFETY_API_URL = process.env.REACT_APP_SAFETY_API_URL || 'http://localhost:8000';
const NATS_URL_DISPLAY = 'nats://nats.airegistry001ku.svc.cluster.local:4222';

let eventCounter = 0;

function normalizeEvent(event) {
  // Supervisor events wrap sub-agent results; flatten them
  const sub = Array.isArray(event?.sub_agent_results) && event.sub_agent_results.length > 0
    ? event.sub_agent_results[0] : null;

  const source = event?.source || event?.agent || (sub && sub.agent) || 'unknown';
  const urgency = event?.urgency || (sub && sub.urgency) || 'none';
  const message = event?.message || (sub && sub.message) || event?.reasoning || '';
  const recommendation = event?.recommendation || (sub && sub.recommendation) || '';
  const alarm = Boolean(event?.alarm_triggered ?? (sub && sub.alarm_triggered));

  // objects_detected / objects_present / detected_labels
  const detected = event?.objects_detected || event?.objects_present || event?.detected_labels || (sub && sub.objects_present) || [];
  const missing = event?.objects_missing || (sub && sub.objects_missing) || [];

  // Derive event_type from data if not present
  let eventType = event?.event_type;
  if (!eventType) {
    if (alarm || urgency === 'high') eventType = 'alert';
    else if (recommendation) eventType = 'recommendation';
    else eventType = 'info';
  }

  return {
    id: event?.id || `EVT-${Date.now()}-${++eventCounter}`,
    timestamp: event?.timestamp || event?.received_at || new Date().toISOString(),
    source,
    event_type: eventType,
    urgency,
    objects_detected: Array.isArray(detected) ? detected : [],
    objects_missing: Array.isArray(missing) ? missing : [],
    message,
    recommendation,
    alarm_triggered: alarm,
    route_to: Array.isArray(event?.route_to) ? event.route_to : [],
    sub_agent_results: Array.isArray(event?.sub_agent_results) ? event.sub_agent_results : [],
  };
}

function eventTypeClass(type) {
  return { alert: 'critical', recommendation: 'warning', info: 'safe' }[type] || 'unknown';
}

function urgencyClass(u) {
  return { high: 'urg-critical', medium: 'urg-high', low: 'urg-medium', none: 'urg-low' }[u] || 'urg-low';
}

function sourceLabel(source) {
  return {
    supervisor_agent: '🧑‍💼 Supervisor',
    facility_agent: '🏭 Facility',
    safety_agent: '🛡️ Safety',
    pallet_agent: '📦 Pallet',
    vehicle_agent: '🚚 Vehicle',
  }[source] || source;
}

function EventRow({ event, isNew, onClick, selected }) {
  return (
    <tr className={`sd-row ${isNew ? 'sd-row-new' : ''} ${selected ? 'sd-row-selected' : ''}`} onClick={() => onClick(event)}>
      <td className="sd-td-time">{new Date(event.timestamp).toLocaleTimeString()}</td>
      <td><span className="sd-source-chip">{sourceLabel(event.source)}</span></td>
      <td><span className={`sd-status-badge ${eventTypeClass(event.event_type)}`}>{event.event_type.toUpperCase()}</span></td>
      <td><span className={`sd-urg-badge ${urgencyClass(event.urgency)}`}>{event.urgency.toUpperCase()}</span></td>
      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{event.message}</td>
      <td>{event.alarm_triggered ? <span style={{ color: '#f85149', fontWeight: 700 }}>🚨 YES</span> : <span style={{ color: '#8b949e' }}>No</span>}</td>
      <td className="sd-td-viols">{event.objects_missing.length}</td>
    </tr>
  );
}

function EventDetail({ event, onClose }) {
  if (!event) return null;
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <div className="detail-title">Event Detail</div>
          <code className="detail-id">{event.id}</code>
        </div>
        <button className="detail-close" onClick={onClose}>✕</button>
      </div>

      <div className="detail-meta">
        <div className="dm-row"><span className="dm-key">Timestamp</span><span className="dm-val">{new Date(event.timestamp).toLocaleString()}</span></div>
        <div className="dm-row"><span className="dm-key">Source</span><span className="sd-source-chip">{sourceLabel(event.source)}</span></div>
        <div className="dm-row"><span className="dm-key">Event Type</span><span className={`sd-status-badge ${eventTypeClass(event.event_type)}`}>{event.event_type.toUpperCase()}</span></div>
        <div className="dm-row"><span className="dm-key">Urgency</span><span className={`sd-urg-badge ${urgencyClass(event.urgency)}`}>{event.urgency.toUpperCase()}</span></div>
        <div className="dm-row"><span className="dm-key">Alarm</span><span style={{ color: event.alarm_triggered ? '#f85149' : '#3fb950', fontWeight: 700 }}>{event.alarm_triggered ? '🚨 TRIGGERED' : '✓ No'}</span></div>
      </div>

      <div className="detail-section-title">Message</div>
      <div style={{ background: '#21262d', borderRadius: 8, padding: 14, fontSize: 13, color: '#e6edf3', marginBottom: 16, lineHeight: 1.5 }}>{event.message || '—'}</div>

      {event.objects_detected.length > 0 && (
        <>
          <div className="detail-section-title">Objects Detected</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {event.objects_detected.map((obj, i) => (
              <span key={i} style={{ background: '#1a3b1a', color: '#3fb950', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>✓ {obj}</span>
            ))}
          </div>
        </>
      )}

      {event.objects_missing.length > 0 && (
        <>
          <div className="detail-section-title critical-title">Objects Missing</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {event.objects_missing.map((obj, i) => (
              <span key={i} style={{ background: '#3d0f0f', color: '#f85149', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>✗ {obj}</span>
            ))}
          </div>
        </>
      )}

      {event.recommendation && (
        <>
          <div className="detail-section-title">Recommendation</div>
          <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8, padding: 14, fontSize: 13, color: '#d29624', lineHeight: 1.5 }}>💡 {event.recommendation}</div>
        </>
      )}
    </div>
  );
}

export default function ReportDashboard({ title, subjectFallback, endpointPath, shieldIcon = '🛡️' }) {
  const reportsEndpoint = `${SAFETY_API_URL}${endpointPath}`;
  const [events, setEvents] = useState([]);
  const [newIds, setNewIds] = useState(new Set());
  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterType, setFilterType] = useState('ALL');
  const [filterUrgency, setFilterUrgency] = useState('ALL');
  const [connState, setConnState] = useState({
    connected: false,
    error: '',
    subject: subjectFallback,
    natsUrl: NATS_URL_DISPLAY,
    lastMessageAt: null,
  });
  const intervalRef = useRef(null);
  const selectedId = selected?.id;

  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current);
      return undefined;
    }

    let disposed = false;

    const loadEvents = async () => {
      try {
        const response = await fetch(reportsEndpoint, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Bridge returned ${response.status}`);

        const payload = await response.json();
        if (disposed) return;

        const nextEvents = Array.isArray(payload.reports) ? payload.reports.map(normalizeEvent) : [];

        setConnState({
          connected: Boolean(payload.connected),
          error: payload.last_error || '',
          subject: payload.subject || subjectFallback,
          natsUrl: payload.nats_url || NATS_URL_DISPLAY,
          lastMessageAt: payload.last_message_at || null,
        });

        setEvents((prev) => {
          const previousIds = new Set(prev.map((e) => e.id));
          const incomingNew = nextEvents.filter((e) => !previousIds.has(e.id)).map((e) => e.id);

          if (incomingNew.length > 0) {
            setNewIds((prevIds) => {
              const nextIds = new Set(prevIds);
              incomingNew.forEach((id) => {
                nextIds.add(id);
                setTimeout(() => setNewIds((cur) => { const s = new Set(cur); s.delete(id); return s; }), 2000);
              });
              return nextIds;
            });
          }
          return nextEvents;
        });
      } catch (error) {
        if (disposed) return;
        setConnState((prev) => ({ ...prev, connected: false, error: error.message }));
      }
    };

    loadEvents();
    intervalRef.current = setInterval(loadEvents, 2000);

    return () => { disposed = true; clearInterval(intervalRef.current); };
  }, [reportsEndpoint, running, subjectFallback]);

  useEffect(() => {
    if (!selectedId) return;
    const updated = events.find((e) => e.id === selectedId);
    setSelected(updated || null);
  }, [events, selectedId]);

  // Derived stats
  const total = events.length;
  const alertCount = events.filter((e) => e.event_type === 'alert').length;
  const recCount = events.filter((e) => e.event_type === 'recommendation').length;
  const infoCount = events.filter((e) => e.event_type === 'info').length;
  const alarmCount = events.filter((e) => e.alarm_triggered).length;

  const urgCounts = { none: 0, low: 0, medium: 0, high: 0 };
  events.forEach((e) => { if (urgCounts[e.urgency] !== undefined) urgCounts[e.urgency] += 1; });

  const sourceCounts = {};
  events.forEach((e) => { sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1; });

  const missingCounts = {};
  events.forEach((e) => e.objects_missing.forEach((obj) => { missingCounts[obj] = (missingCounts[obj] || 0) + 1; }));

  const detectedCounts = {};
  events.forEach((e) => e.objects_detected.forEach((obj) => { detectedCounts[obj] = (detectedCounts[obj] || 0) + 1; }));

  const totalMissing = events.reduce((s, e) => s + e.objects_missing.length, 0);
  const recommendations = events.filter((e) => e.recommendation).slice(0, 12);
  const alerts = events.filter((e) => e.event_type === 'alert').slice(0, 10);

  const filtered = events.filter((e) =>
    (filterType === 'ALL' || e.event_type === filterType.toLowerCase()) &&
    (filterUrgency === 'ALL' || e.urgency === filterUrgency.toLowerCase())
  );

  return (
    <div className="sd-page">
      <Link to="/" className="back-home-btn">← Home</Link>

      <div className="sd-header">
        <div className="sd-header-left">
          <span className="sd-shield">{shieldIcon}</span>
          <div>
            <h1 className="sd-title">{title}</h1>
            <span className="sd-subtitle">
              <code>{connState.subject}</code> &nbsp;·&nbsp; <code>{connState.natsUrl}</code>
            </span>
            {connState.error && <div style={{ color: '#f85149', fontSize: 12, marginTop: 6 }}>Bridge unavailable: {connState.error}</div>}
          </div>
        </div>
        <div className="sd-header-right">
          <span className={`mode-badge ${running && connState.connected ? 'mode-live' : 'mode-paused'}`}>
            {running && connState.connected ? '● LIVE' : running ? '◌ CONNECTING' : '⏸ PAUSED'}
          </span>
          <button className={`btn-toggle ${running ? 'btn-stop' : 'btn-start'}`} onClick={() => setRunning((v) => !v)}>
            {running ? 'Stop Feed' : 'Start Feed'}
          </button>
        </div>
      </div>

      <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 16 }}>
        Bridge: <code>{reportsEndpoint}</code> &nbsp;·&nbsp; Subject: <code>{subjectFallback}</code>
        {connState.lastMessageAt ? `  •  Last message: ${new Date(connState.lastMessageAt).toLocaleString()}` : '  •  Waiting for first NATS message'}
      </div>

      <div className="sd-tabs">
        {['overview', 'events', 'alerts', 'recommendations'].map((tab) => (
          <button key={tab} className={`sd-tab ${activeTab === tab ? 'sd-tab-active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'overview' && '📊 '}
            {tab === 'events' && '📋 '}
            {tab === 'alerts' && '🚨 '}
            {tab === 'recommendations' && '💡 '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ══════════════ OVERVIEW TAB ══════════════ */}
      {activeTab === 'overview' && (
        <>
          <div className="sd-stats-grid">
            <div className="sd-stat-card"><div className="sd-stat-icon">📋</div><div className="sd-stat-value">{total}</div><div className="sd-stat-label">Total Events</div></div>
            <div className="sd-stat-card sd-stat-critical"><div className="sd-stat-icon">🚨</div><div className="sd-stat-value">{alertCount}</div><div className="sd-stat-label">Alerts</div><div className="sd-stat-pct">{total ? Math.round((alertCount / total) * 100) : 0}%</div></div>
            <div className="sd-stat-card sd-stat-warning"><div className="sd-stat-icon">💡</div><div className="sd-stat-value">{recCount}</div><div className="sd-stat-label">Recommendations</div><div className="sd-stat-pct">{total ? Math.round((recCount / total) * 100) : 0}%</div></div>
            <div className="sd-stat-card sd-stat-safe"><div className="sd-stat-icon">ℹ️</div><div className="sd-stat-value">{infoCount}</div><div className="sd-stat-label">Info</div><div className="sd-stat-pct">{total ? Math.round((infoCount / total) * 100) : 0}%</div></div>
            <div className="sd-stat-card sd-stat-viol"><div className="sd-stat-icon">🔔</div><div className="sd-stat-value">{alarmCount}</div><div className="sd-stat-label">Alarms Triggered</div></div>
            <div className="sd-stat-card sd-stat-critf"><div className="sd-stat-icon">⚠️</div><div className="sd-stat-value">{totalMissing}</div><div className="sd-stat-label">Missing Objects</div></div>
          </div>

          <div className="sd-overview-row">
            <div className="sd-panel">
              <div className="sd-panel-title">Urgency Distribution</div>
              <div className="urg-bars">
                <div className="urg-row"><span className="urg-label urg-critical">HIGH</span><div className="urg-track"><div className="urg-fill" style={{ width: `${total ? Math.round((urgCounts.high / total) * 100) : 0}%`, background: 'var(--urg-critical)' }} /></div><span className="urg-count">{urgCounts.high}</span></div>
                <div className="urg-row"><span className="urg-label urg-high">MEDIUM</span><div className="urg-track"><div className="urg-fill" style={{ width: `${total ? Math.round((urgCounts.medium / total) * 100) : 0}%`, background: 'var(--urg-high)' }} /></div><span className="urg-count">{urgCounts.medium}</span></div>
                <div className="urg-row"><span className="urg-label urg-medium">LOW</span><div className="urg-track"><div className="urg-fill" style={{ width: `${total ? Math.round((urgCounts.low / total) * 100) : 0}%`, background: 'var(--urg-medium)' }} /></div><span className="urg-count">{urgCounts.low}</span></div>
                <div className="urg-row"><span className="urg-label urg-low">NONE</span><div className="urg-track"><div className="urg-fill" style={{ width: `${total ? Math.round((urgCounts.none / total) * 100) : 0}%`, background: 'var(--urg-low)' }} /></div><span className="urg-count">{urgCounts.none}</span></div>
              </div>
            </div>

            <div className="sd-panel">
              <div className="sd-panel-title">Events by Source</div>
              <div className="urg-bars">
                {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                  <div key={source} className="urg-row">
                    <span className="urg-label urg-low" style={{ minWidth: 110 }}>{sourceLabel(source)}</span>
                    <div className="urg-track"><div className="urg-fill" style={{ width: `${Math.round((count / total) * 100)}%`, background: '#58a6ff' }} /></div>
                    <span className="urg-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sd-panel">
              <div className="sd-panel-title">Missing Objects (PPE Gaps)</div>
              <div className="urg-bars">
                {Object.entries(missingCounts).sort((a, b) => b[1] - a[1]).map(([obj, count]) => (
                  <div key={obj} className="urg-row">
                    <span className="urg-label urg-critical" style={{ minWidth: 100 }}>✗ {obj}</span>
                    <div className="urg-track"><div className="urg-fill" style={{ width: `${Math.round((count / Math.max(...Object.values(missingCounts), 1)) * 100)}%`, background: '#f85149' }} /></div>
                    <span className="urg-count">{count}</span>
                  </div>
                ))}
                {Object.keys(missingCounts).length === 0 && <div style={{ color: '#3fb950', fontSize: 13 }}>✅ No missing objects detected</div>}
              </div>
            </div>
          </div>

          <div className="sd-panel" style={{ marginBottom: 24 }}>
            <div className="sd-panel-title">Event Type Breakdown</div>
            <div className="status-breakdown">
              {[['INFO', infoCount, '#3fb950'], ['RECOMMENDATION', recCount, '#d29624'], ['ALERT', alertCount, '#f85149']].map(([label, count, color]) => (
                <div key={label} className="sb-item">
                  <div className="sb-bar-wrap"><div className="sb-bar" style={{ height: `${total ? Math.round((count / total) * 120) : 0}px`, background: color }} /></div>
                  <div className="sb-count" style={{ color }}>{count}</div>
                  <div className="sb-label">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="sd-panel">
            <div className="sd-panel-title">Recent Events (last 5)</div>
            <table className="sd-mini-table">
              <thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Urgency</th><th>Message</th><th>Alarm</th></tr></thead>
              <tbody>
                {events.slice(0, 5).map((event) => (
                  <tr key={event.id} className={newIds.has(event.id) ? 'sd-row-new' : ''} onClick={() => { setSelected(event); setActiveTab('events'); }}>
                    <td style={{ color: '#8b949e', fontSize: 12, fontFamily: 'monospace' }}>{new Date(event.timestamp).toLocaleTimeString()}</td>
                    <td><span className="sd-source-chip">{sourceLabel(event.source)}</span></td>
                    <td><span className={`sd-status-badge ${eventTypeClass(event.event_type)}`}>{event.event_type}</span></td>
                    <td><span className={`sd-urg-badge ${urgencyClass(event.urgency)}`}>{event.urgency}</span></td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{event.message}</td>
                    <td>{event.alarm_triggered ? '🚨' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════════ EVENTS TAB ══════════════ */}
      {activeTab === 'events' && (
        <div className="sd-reports-layout">
          <div className="sd-reports-main">
            <div className="sd-filter-bar">
              <span className="sd-filter-label">Type:</span>
              {['ALL', 'INFO', 'RECOMMENDATION', 'ALERT'].map((value) => (
                <button key={value} className={`filter-btn ${filterType === value ? 'filter-active' : ''}`} onClick={() => setFilterType(value)}>{value}</button>
              ))}
              <span className="sd-filter-label" style={{ marginLeft: 16 }}>Urgency:</span>
              {['ALL', 'NONE', 'LOW', 'MEDIUM', 'HIGH'].map((value) => (
                <button key={value} className={`filter-btn ${filterUrgency === value ? 'filter-active' : ''}`} onClick={() => setFilterUrgency(value)}>{value}</button>
              ))}
              <span className="sd-filter-count">{filtered.length} events</span>
            </div>

            <div className="sd-table-scroll">
              <table className="sd-table">
                <thead>
                  <tr><th>Time</th><th>Source</th><th>Type</th><th>Urgency</th><th>Message</th><th>Alarm</th><th>Missing</th></tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <EventRow key={event.id} event={event} isNew={newIds.has(event.id)} selected={selected?.id === event.id} onClick={setSelected} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selected && <EventDetail event={selected} onClose={() => setSelected(null)} />}
        </div>
      )}

      {/* ══════════════ ALERTS TAB ══════════════ */}
      {activeTab === 'alerts' && (
        <div className="sd-viols-layout">
          <div className="sd-panel" style={{ marginBottom: 20 }}>
            <div className="sd-panel-title">Active Alerts ({alerts.length})</div>
            <div className="actions-grid">
              {alerts.map((event, index) => (
                <div key={index} className="action-card" style={{ borderLeft: '3px solid #f85149', cursor: 'pointer' }} onClick={() => { setSelected(event); setActiveTab('events'); }}>
                  <div className="action-text" style={{ color: '#f85149' }}>{event.alarm_triggered ? '🚨 ' : '⚠️ '}{event.message}</div>
                  <div className="action-meta">
                    <span className="sd-source-chip">{sourceLabel(event.source)}</span>
                    <span className={`sd-urg-badge ${urgencyClass(event.urgency)}`}>{event.urgency}</span>
                    <span className="action-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {event.objects_missing.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {event.objects_missing.map((obj, i) => (
                        <span key={i} style={{ background: '#3d0f0f', color: '#f85149', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>✗ {obj}</span>
                      ))}
                    </div>
                  )}
                  {event.recommendation && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#d29624' }}>💡 {event.recommendation}</div>
                  )}
                </div>
              ))}
              {alerts.length === 0 && <div style={{ color: '#3fb950', padding: 20, textAlign: 'center' }}>✅ No alerts — all clear</div>}
            </div>
          </div>

          <div className="sd-panel">
            <div className="sd-panel-title">Missing Objects from Alerts</div>
            <div className="viol-type-grid">
              {Object.entries(missingCounts).sort((a, b) => b[1] - a[1]).map(([obj, count]) => (
                <div key={obj} className="viol-type-card"><span className="vtc-icon">⚠️</span><span className="vtc-name">{obj}</span><span className="vtc-count">{count}</span></div>
              ))}
              {Object.keys(missingCounts).length === 0 && <div style={{ color: '#3fb950', fontSize: 13, padding: 10 }}>No missing objects</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ RECOMMENDATIONS TAB ══════════════ */}
      {activeTab === 'recommendations' && (
        <div>
          <div className="sd-panel" style={{ marginBottom: 20 }}>
            <div className="sd-panel-title">Recommendations ({recommendations.length} shown)</div>
            <div className="actions-grid">
              {recommendations.map((event, index) => (
                <div key={index} className="action-card" style={{ borderLeft: '3px solid #d29624', cursor: 'pointer' }} onClick={() => { setSelected(event); setActiveTab('events'); }}>
                  <div className="action-text">💡 {event.recommendation}</div>
                  <div className="action-meta">
                    <span className="sd-source-chip">{sourceLabel(event.source)}</span>
                    <span className={`sd-urg-badge ${urgencyClass(event.urgency)}`}>{event.urgency}</span>
                    <span className="action-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {event.objects_detected.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#8b949e' }}>
                      Detected: {event.objects_detected.join(', ')}
                    </div>
                  )}
                </div>
              ))}
              {recommendations.length === 0 && <div style={{ color: '#8b949e', padding: 20, textAlign: 'center' }}>No recommendations yet</div>}
            </div>
          </div>

          <div className="sd-panel">
            <div className="sd-panel-title">Objects Detected (all events)</div>
            <div className="viol-type-grid">
              {Object.entries(detectedCounts).sort((a, b) => b[1] - a[1]).map(([obj, count]) => (
                <div key={obj} className="viol-type-card"><span className="vtc-icon">✓</span><span className="vtc-name">{obj}</span><span className="vtc-count">{count}</span></div>
              ))}
              {Object.keys(detectedCounts).length === 0 && <div style={{ color: '#8b949e', fontSize: 13, padding: 10 }}>No objects detected yet</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
