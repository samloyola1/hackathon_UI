import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './NatsMonitor.css';

const SAFETY_API_URL = process.env.REACT_APP_SAFETY_API_URL || 'http://localhost:8000';
const ALL_EVENTS_URL = `${SAFETY_API_URL}/api/all-events`;

let evtCounter = 0;

function normalizeEvent(event) {
  const sub = Array.isArray(event?.sub_agent_results) && event.sub_agent_results.length > 0
    ? event.sub_agent_results[0] : null;

  const source = event?.source || event?.agent || (sub && sub.agent) || 'unknown';
  const urgency = event?.urgency || (sub && sub.urgency) || 'none';
  const message = event?.message || (sub && sub.message) || event?.reasoning || '';
  const recommendation = event?.recommendation || (sub && sub.recommendation) || '';
  const alarm = Boolean(event?.alarm_triggered ?? (sub && sub.alarm_triggered));

  const detected = event?.objects_detected || event?.objects_present || event?.detected_labels || (sub && sub.objects_present) || [];
  const missing = event?.objects_missing || (sub && sub.objects_missing) || [];

  let eventType = event?.event_type;
  if (!eventType) {
    if (alarm || urgency === 'high') eventType = 'alert';
    else if (recommendation) eventType = 'recommendation';
    else eventType = 'info';
  }

  return {
    id: event?.id || `EVT-${Date.now()}-${++evtCounter}`,
    timestamp: event?.timestamp || event?.received_at || new Date().toISOString(),
    source,
    event_type: eventType,
    urgency,
    objects_detected: Array.isArray(detected) ? detected : [],
    objects_missing: Array.isArray(missing) ? missing : [],
    message,
    recommendation,
    alarm_triggered: alarm,
    _dashboard: event?._dashboard || '',
    _subject: event?._subject || '',
  };
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

function eventTypeClass(type) {
  return { alert: 'critical', recommendation: 'warning', info: 'safe' }[type] || 'unknown';
}

function urgencyClass(u) {
  return { high: 'urg-critical', medium: 'urg-high', low: 'urg-medium', none: 'urg-low' }[u] || 'urg-low';
}

// ── NATS Connection Details panel ───────────────────────────────────────────
function NatsDetails({ connState, total, subjects }) {
  const [open, setOpen] = useState(true);
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="nats-details-panel">
      <button className="nats-details-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="nd-toggle-icon">{open ? '▾' : '▸'}</span>
        <span className="nd-toggle-title">NATS Connection Details</span>
        <span className="nd-uptime-pill">⏱ Uptime {uptime}</span>
      </button>
      {open && (
        <div className="nd-body">
          <div className="nd-info-grid">
            <div className="nd-info-block">
              <div className="nd-block-title">Connection</div>
              <div className="nd-rows">
                <div className="nd-row"><span className="nd-key">Server</span><code className="nd-val">{connState.natsUrl}</code></div>
                <div className="nd-row"><span className="nd-key">Protocol</span><span className="nd-val">NATS 2.x (TCP via bridge)</span></div>
                <div className="nd-row"><span className="nd-key">Status</span><span className={`nd-val ${connState.connected ? 'nd-green' : ''}`}>{connState.connected ? '● Connected' : '○ Disconnected'}</span></div>
                <div className="nd-row"><span className="nd-key">Bridge</span><code className="nd-val">{ALL_EVENTS_URL}</code></div>
              </div>
            </div>
            <div className="nd-info-block">
              <div className="nd-block-title">Session</div>
              <div className="nd-rows">
                <div className="nd-row"><span className="nd-key">Uptime</span><span className="nd-val nd-green">{uptime}</span></div>
                <div className="nd-row"><span className="nd-key">Events Total</span><span className="nd-val nd-green">{total}</span></div>
                {connState.error && <div className="nd-row"><span className="nd-key">Error</span><span className="nd-val" style={{ color: '#f85149' }}>{connState.error}</span></div>}
              </div>
            </div>
          </div>
          <div className="nd-block-title" style={{ marginTop: 16 }}>Subscribed Subjects</div>
          <div className="nd-components">
            {Object.entries(subjects).map(([key, subject]) => (
              <div key={key} className="nd-component-chip">
                <span className="nd-comp-dot" />
                <code className="nd-comp-name">{subject}</code>
                <span className="nd-comp-ok">[{key}]</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live Camera with detection feed ─────────────────────────────────────────
function LiveCamera({ onDetection }) {
  const [live, setLive]             = useState(false);
  const [error, setError]           = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState({ persons: 0, helmets: 0 });
  const [time, setTime]             = useState(new Date().toLocaleTimeString());

  const videoRef     = useRef(null);
  const canvasRef    = useRef(null);
  const offscreenRef = useRef(null);
  const streamRef    = useRef(null);
  const modelRef     = useRef(null);
  const rafRef       = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    offscreenRef.current = document.createElement('canvas');
    const detector = window.cocoSsd;
    if (!detector) { setError('AI model script not ready. Check internet and refresh.'); return; }
    detector.load()
      .then((model) => { modelRef.current = model; setModelReady(true); })
      .catch(() => setError('Failed to load AI model.'));
  }, []);

  const hasHelmet = useCallback((video, bbox) => {
    const offscreen = offscreenRef.current;
    if (!offscreen || !video || video.videoWidth === 0) return false;
    offscreen.width = video.videoWidth; offscreen.height = video.videoHeight;
    const octx = offscreen.getContext('2d'); octx.drawImage(video, 0, 0);
    const [x, y, w, h] = bbox;
    const rx = Math.max(0, Math.round(x + w * 0.1)), ry = Math.max(0, Math.round(y));
    const rw = Math.max(1, Math.round(w * 0.8)), rh = Math.max(1, Math.round(h * 0.25));
    let imageData;
    try { imageData = octx.getImageData(rx, ry, rw, rh); } catch (_) { return false; }
    const data = imageData.data; const total = data.length / 4; let hit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r>180&&g>140&&b<100) { hit++; continue; }
      if (r>190&&g>190&&b>190) { hit++; continue; }
      if (r>190&&g>70&&g<160&&b<70) { hit++; continue; }
      if (r>160&&g<90&&b<90) { hit++; continue; }
      if (r<100&&g<130&&b>150) { hit++; continue; }
    }
    return (hit / total) > 0.12;
  }, []);

  const drawDetections = useCallback((predictions, video) => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let pCount = 0, hCount = 0;
    predictions.forEach((pred) => {
      if (pred.class !== 'person') return;
      pCount++;
      const [x, y, w, h] = pred.bbox;
      const conf = Math.round(pred.score * 100);
      const helmetOn = hasHelmet(video, pred.bbox);
      if (helmetOn) hCount++;
      const color = helmetOn ? '#00e676' : '#f44336';
      const label = helmetOn ? `⛑ HELMET  ${conf}%` : `⚠ NO HELMET  ${conf}%`;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h);
      const m = 12; ctx.lineWidth = 3;
      [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy]) => {
        ctx.beginPath(); ctx.moveTo(cx+(cx===x?m:-m),cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+(cy===y?m:-m)); ctx.stroke();
      });
      ctx.fillStyle = color; ctx.fillRect(x, y-26, Math.max(w,160), 26);
      ctx.fillStyle = '#000'; ctx.font = 'bold 13px monospace'; ctx.fillText(label, x+5, y-8);
    });
    setDetections({ persons: pCount, helmets: hCount });
    if (pCount > 0 && onDetection) onDetection(pCount, hCount);
  }, [hasHelmet, onDetection]);

  const detect = useCallback(async () => {
    const video = videoRef.current; const model = modelRef.current;
    if (!video || !model || video.readyState < 2) { rafRef.current = requestAnimationFrame(detect); return; }
    const preds = await model.detect(video);
    drawDetections(preds, video);
    rafRef.current = requestAnimationFrame(detect);
  }, [drawDetections]);

  useEffect(() => {
    if (live) {
      setError(null);
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadeddata = () => { rafRef.current = requestAnimationFrame(detect); }; }
        })
        .catch(() => { setLive(false); setError('Camera access denied or unavailable.'); });
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      const c = canvasRef.current; if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      setDetections({ persons: 0, helmets: 0 });
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, [live, detect]);

  const noHelmet = detections.persons - detections.helmets;
  return (
    <div className="nats-camera-section">
      <div className="nats-camera-header">
        <div className="nats-camera-title">
          <span className="nats-camera-icon">📷</span>
          <h3 className="section-title" style={{ margin: 0 }}>Live Camera Feed</h3>
          <span className="nats-cam-channel">CAM 01 · Local Detection</span>
        </div>
        <div className="cam-controls">
          {live && detections.persons > 0 && <span className="person-badge">👤 {detections.persons}</span>}
          {live && detections.helmets > 0 && <span className="helmet-badge safe">⛑ {detections.helmets}</span>}
          {live && noHelmet > 0 && <span className="helmet-badge warn">⚠ {noHelmet} No Helmet</span>}
          {!modelReady && !error && <span className="model-loading">Loading AI model…</span>}
          <button className="pill" onClick={() => setLive((v) => !v)} disabled={!modelReady}>
            <span className={`dot ${live ? 'on' : 'off'}`} />{live ? 'LIVE' : 'START'}
          </button>
        </div>
      </div>
      <div className="camera-feed">
        <video ref={videoRef} autoPlay playsInline muted className={`camera-video ${live ? 'visible' : ''}`} />
        <canvas ref={canvasRef} className="detection-canvas" />
        {!live && <div className="camera-placeholder"><span className="camera-off-icon">📷</span><p>Click <strong>START</strong> to enable camera detection</p></div>}
        {error && <div className="camera-error">⚠ {error}</div>}
        <div className="camera-overlay"><span>CAM 01 · Live</span><span>{time}</span></div>
        {live && <div className="scanline" />}
      </div>
      <div className="camera-thumbs">
        {['CAM 02', 'CAM 03', 'CAM 04', 'CAM 05'].map((c) => <div className="thumb" key={c}>{c}</div>)}
      </div>
    </div>
  );
}

// ── Event row ───────────────────────────────────────────────────────────────
function EventRow({ event, isNew }) {
  const typeColors = { alert: '#f85149', recommendation: '#d29624', info: '#3fb950' };
  return (
    <tr className={`event-row ${isNew ? 'event-row-new' : ''}`}>
      <td className="td-time">{new Date(event.timestamp).toLocaleTimeString()}</td>
      <td><span className="sd-source-chip" style={{ fontSize: 11 }}>{sourceLabel(event.source)}</span></td>
      <td><span style={{ color: typeColors[event.event_type] || '#8b949e', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{event.event_type}</span></td>
      <td><span style={{ color: event.urgency === 'high' ? '#f85149' : event.urgency === 'medium' ? '#f0883e' : event.urgency === 'low' ? '#d29624' : '#8b949e', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{event.urgency}</span></td>
      <td className="td-classes">
        {event.objects_detected.map((c, i) => <span key={i} className="class-tag class-person">{c}</span>)}
      </td>
      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#c9d1d9' }}>{event.message}</td>
      <td>{event.alarm_triggered ? <span style={{ color: '#f85149' }}>🚨</span> : <span style={{ color: '#484f58' }}>—</span>}</td>
      <td><code style={{ fontSize: 10, color: '#58a6ff' }}>{event._subject || '—'}</code></td>
    </tr>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function NatsMonitor() {
  const [events, setEvents]      = useState([]);
  const [newIds, setNewIds]      = useState(new Set());
  const [running, setRunning]    = useState(true);
  const [filterSource, setFilter] = useState('all');
  const [connState, setConnState] = useState({ connected: false, error: '', natsUrl: 'nats://nats.airegistry001ku.svc.cluster.local:4222' });
  const [subjects, setSubjects]  = useState({});
  const tableBodyRef             = useRef(null);
  const intervalRef              = useRef(null);

  const handleCameraDetection = useCallback(() => {}, []);

  useEffect(() => {
    if (tableBodyRef.current) tableBodyRef.current.scrollTop = 0;
  }, [events]);

  // Poll bridge for all events
  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return undefined; }

    let disposed = false;

    const loadEvents = async () => {
      try {
        const res = await fetch(ALL_EVENTS_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
        const payload = await res.json();
        if (disposed) return;

        const nextEvents = Array.isArray(payload.events) ? payload.events.map(normalizeEvent) : [];

        setConnState({ connected: Boolean(payload.connected), error: payload.last_error || '', natsUrl: payload.nats_url || 'nats://nats.airegistry001ku.svc.cluster.local:4222' });
        if (payload.subjects) setSubjects(payload.subjects);

        setEvents((prev) => {
          const prevIds = new Set(prev.map((e) => e.id));
          const incoming = nextEvents.filter((e) => !prevIds.has(e.id)).map((e) => e.id);
          if (incoming.length > 0) {
            setNewIds((p) => {
              const n = new Set(p);
              incoming.forEach((id) => { n.add(id); setTimeout(() => setNewIds((c) => { const s = new Set(c); s.delete(id); return s; }), 1500); });
              return n;
            });
          }
          return nextEvents;
        });
      } catch (err) {
        if (!disposed) setConnState((p) => ({ ...p, connected: false, error: err.message }));
      }
    };

    loadEvents();
    intervalRef.current = setInterval(loadEvents, 2000);
    return () => { disposed = true; clearInterval(intervalRef.current); };
  }, [running]);

  const total = events.length;
  const alertCount = events.filter((e) => e.event_type === 'alert').length;
  const recCount = events.filter((e) => e.event_type === 'recommendation').length;
  const infoCount = events.filter((e) => e.event_type === 'info').length;
  const alarmCount = events.filter((e) => e.alarm_triggered).length;

  const sourceCounts = {};
  events.forEach((e) => { sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1; });

  const classCounts = {};
  events.forEach((e) => e.objects_detected.forEach((c) => { classCounts[c] = (classCounts[c] || 0) + 1; }));

  const filtered = filterSource === 'all' ? events : events.filter((e) => e.source === filterSource);

  return (
    <div className="nats-page">
      <Link to="/" className="back-home-btn">← Home</Link>

      {/* Header */}
      <div className="nats-header">
        <div className="nats-header-left">
          <span className="nats-dot" />
          <h1 className="nats-title">NATS Live Monitor</h1>
          <span className="nats-sub">All Subjects</span>
        </div>
        <div className="nats-header-right">
          <span className={`mode-badge ${running && connState.connected ? 'mode-live' : 'mode-paused'}`}>
            {running && connState.connected ? '● LIVE' : running ? '◌ CONNECTING' : '⏸ PAUSED'}
          </span>
          <button className={`btn-toggle ${running ? 'btn-stop' : 'btn-start'}`} onClick={() => setRunning((r) => !r)}>
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* System status chips */}
      <div className="sys-status-bar">
        {Object.entries(sourceCounts).map(([source, count]) => (
          <div key={source} className="sys-chip sys-ok"><span className="sys-dot" /> {sourceLabel(source)} ({count})</div>
        ))}
        {connState.connected
          ? <div className="sys-chip sys-ok"><span className="sys-dot" /> Bridge Connected</div>
          : <div className="sys-chip sys-warn"><span className="sys-dot sys-dot-warn" /> Bridge Disconnected</div>
        }
      </div>

      {/* NATS Connection Details */}
      <NatsDetails connState={connState} total={total} subjects={subjects} />

      {/* Live Camera */}
      <LiveCamera onDetection={handleCameraDetection} />

      {/* Stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Events Received</div>
        </div>
        <div className="stat-card stat-card-safety">
          <div className="stat-value">{alertCount}</div>
          <div className="stat-label">Alerts</div>
          <div className="stat-pct">{total ? Math.round((alertCount / total) * 100) : 0}% of events</div>
        </div>
        <div className="stat-card stat-card-facility">
          <div className="stat-value">{recCount}</div>
          <div className="stat-label">Recommendations</div>
          <div className="stat-pct">{total ? Math.round((recCount / total) * 100) : 0}% of events</div>
        </div>
        <div className="stat-card stat-card-pallet">
          <div className="stat-value">{infoCount}</div>
          <div className="stat-label">Info Events</div>
          <div className="stat-pct">{total ? Math.round((infoCount / total) * 100) : 0}% of events</div>
        </div>
        <div className="stat-card stat-card-recs">
          <div className="stat-value">{alarmCount}</div>
          <div className="stat-label">Alarms Triggered</div>
        </div>
      </div>

      {/* Detection breakdown + Source routing */}
      <div className="section-row">
        <div className="class-breakdown">
          <h3 className="section-title">Objects Detected</h3>
          <div className="class-bars">
            {Object.entries(classCounts).sort((a,b) => b[1]-a[1]).map(([cls, count]) => (
              <div key={cls} className="class-bar-row">
                <span className="class-tag class-person">{cls}</span>
                <div className="bar-track"><div className="bar-fill bar-fill-person" style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
            {Object.keys(classCounts).length === 0 && <div style={{ color: '#8b949e', fontSize: 13 }}>Waiting for events…</div>}
          </div>
        </div>
        <div className="agent-summary">
          <h3 className="section-title">Events by Source Agent</h3>
          <div className="agent-rows">
            {Object.entries(sourceCounts).sort((a,b) => b[1]-a[1]).map(([source, count]) => (
              <div key={source} className="agent-row">
                <span className="agent-name">{sourceLabel(source)}</span>
                <div className="bar-track"><div className="bar-fill bar-fill-safety" style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></div>
                <span className="bar-count">{count} / {total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event feed */}
      <div className="event-feed">
        <div className="feed-header">
          <h3 className="section-title">Event Feed</h3>
          <div className="filter-row">
            <span className="filter-label">Filter by source:</span>
            {['all', ...Object.keys(sourceCounts)].map((c) => (
              <button key={c} className={`filter-btn ${filterSource === c ? 'filter-active' : ''}`} onClick={() => setFilter(c)}>
                {c === 'all' ? 'ALL' : sourceLabel(c)}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll" ref={tableBodyRef}>
          <table className="events-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Type</th>
                <th>Urgency</th>
                <th>Objects</th>
                <th>Message</th>
                <th>Alarm</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => <EventRow key={ev.id} event={ev} isNew={newIds.has(ev.id)} />)}
            </tbody>
          </table>
        </div>
        <div className="feed-footer">
          Showing {filtered.length} of {total} events &nbsp;·&nbsp; Subscribed to {Object.keys(subjects).length} subjects
        </div>
      </div>
    </div>
  );
}
