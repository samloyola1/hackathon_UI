import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './SafetyAgent.css';

// ── Helmet color analysis (same logic as Dashboard) ────────────────────────
function sampleHelmet(video, offscreen, bbox) {
  if (!offscreen || !video || video.videoWidth === 0) return false;
  offscreen.width  = video.videoWidth;
  offscreen.height = video.videoHeight;
  const octx = offscreen.getContext('2d');
  octx.drawImage(video, 0, 0);
  const [x, y, w, h] = bbox;
  const rx = Math.max(0, Math.round(x + w * 0.1));
  const ry = Math.max(0, Math.round(y));
  const rw = Math.max(1, Math.round(w * 0.8));
  const rh = Math.max(1, Math.round(h * 0.25));
  let imageData;
  try { imageData = octx.getImageData(rx, ry, rw, rh); } catch (_) { return false; }
  const data  = imageData.data;
  const total = data.length / 4;
  let hit = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g > 140 && b < 100)                         { hit++; continue; } // yellow
    if (r > 190 && g > 190 && b > 190)                         { hit++; continue; } // white
    if (r > 190 && g > 70 && g < 160 && b < 70)                { hit++; continue; } // orange
    if (r > 160 && g < 90 && b < 90)                           { hit++; continue; } // red
    if (r < 100 && g < 130 && b > 150)                         { hit++; continue; } // blue
  }
  return (hit / total) > 0.12;
}

// ── Safety rules config ─────────────────────────────────────────────────────
const RULES = [
  { id: 1, icon: '⛑', label: 'Helmet Mandatory',  desc: 'All persons must wear a hard hat at all times.'  },
  { id: 2, icon: '👤', label: 'Max Occupancy: 10', desc: 'Alert when persons in zone exceed 10.'           },
  { id: 3, icon: '📸', label: 'Continuous Scan',   desc: 'AI scans every frame at ~30 FPS.'               },
  { id: 4, icon: '🔔', label: 'Instant Alert',     desc: 'Log entry created on each policy violation.'    },
];

function logEntry(type, message) {
  return { id: Date.now() + Math.random(), type, message, time: new Date().toLocaleTimeString() };
}

export default function SafetyAgent() {
  // ── Camera + detection state ──────────────────────────────────────────────
  const [live,       setLive]       = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [camError,   setCamError]   = useState(null);

  // ── Safety metrics ────────────────────────────────────────────────────────
  const [persons,     setPersons]     = useState(0);
  const [helmets,     setHelmets]     = useState(0);
  const [violations,  setViolations]  = useState(0);
  const [totalScans,  setTotalScans]  = useState(0);
  const [activityLog, setActivityLog] = useState([
    logEntry('info',    'Safety Agent initialised.'),
    logEntry('info',    'Waiting for camera feed…'),
  ]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const offscreenRef  = useRef(null);
  const streamRef     = useRef(null);
  const modelRef      = useRef(null);
  const rafRef        = useRef(null);
  const prevPersons   = useRef(0);
  const prevViolations= useRef(0);

  // ── Load model + create offscreen canvas ─────────────────────────────────
  useEffect(() => {
    offscreenRef.current = document.createElement('canvas');
    const detector = window.cocoSsd;
    if (!detector) {
      setCamError('COCO-SSD not loaded. Check internet and refresh.');
      return;
    }
    detector.load()
      .then((m) => { modelRef.current = m; setModelReady(true);
        setActivityLog((l) => [...l, logEntry('success', 'AI model loaded. Ready to monitor.')]);
      })
      .catch(() => setCamError('Failed to load AI model.'));
  }, []);

  // ── Push log entries (deduplicated per change) ────────────────────────────
  const pushLog = useCallback((type, msg) => {
    setActivityLog((l) => [logEntry(type, msg), ...l].slice(0, 50));
  }, []);

  // ── Draw detections on overlay canvas ────────────────────────────────────
  const drawDetections = useCallback((predictions, video) => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let pCount = 0, hCount = 0;
    predictions.forEach((pred) => {
      if (pred.class !== 'person') return;
      pCount++;
      const [x, y, w, h] = pred.bbox;
      const conf      = Math.round(pred.score * 100);
      const helmetOn  = sampleHelmet(video, offscreenRef.current, pred.bbox);
      if (helmetOn) hCount++;

      const color = helmetOn ? '#00e676' : '#f44336';
      const label = helmetOn ? `⛑ HELMET  ${conf}%` : `⚠ NO HELMET  ${conf}%`;

      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);

      // corner markers
      const m = 12; ctx.lineWidth = 3;
      [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([cx,cy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + (cx===x ? m : -m), cy); ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + (cy===y ? m : -m)); ctx.stroke();
      });

      ctx.fillStyle = color;
      ctx.fillRect(x, y - 26, Math.max(w, 160), 26);
      ctx.fillStyle = '#000'; ctx.font = 'bold 13px monospace';
      ctx.fillText(label, x + 5, y - 8);
    });

    setPersons(pCount);
    setHelmets(hCount);
    setTotalScans((s) => s + 1);

    const vioCount = pCount - hCount;

    // Log on person count change
    if (pCount !== prevPersons.current) {
      if (pCount > prevPersons.current)
        pushLog('info', `${pCount} person${pCount > 1 ? 's' : ''} detected in frame.`);
      else if (pCount === 0)
        pushLog('info', 'Zone clear — no persons detected.');
      prevPersons.current = pCount;
    }

    // Log on violation change
    if (vioCount !== prevViolations.current) {
      if (vioCount > 0)
        pushLog('warn', `${vioCount} person${vioCount > 1 ? 's' : ''} without helmet — violation logged.`);
      else if (pCount > 0)
        pushLog('success', 'All persons compliant — helmets detected.');
      prevViolations.current = vioCount;
      if (vioCount > 0) setViolations((v) => v + 1);
    }
  }, [pushLog]);

  // ── Detection loop ────────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    const video = videoRef.current;
    const model = modelRef.current;
    if (!video || !model || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect); return;
    }
    const preds = await model.detect(video);
    drawDetections(preds, video);
    rafRef.current = requestAnimationFrame(detect);
  }, [drawDetections]);

  // ── Start / stop camera ───────────────────────────────────────────────────
  useEffect(() => {
    if (live) {
      setCamError(null);
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              rafRef.current = requestAnimationFrame(detect);
              pushLog('success', 'Camera feed started. Agent is monitoring…');
            };
          }
        })
        .catch(() => { setLive(false); setCamError('Camera access denied.'); });
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      setPersons(0); setHelmets(0);
      if (live === false && modelReady) pushLog('info', 'Camera feed stopped.');
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, detect]);

  // ── Derived metrics ───────────────────────────────────────────────────────
  const noHelmet     = persons - helmets;
  const compliance   = persons > 0 ? Math.round((helmets / persons) * 100) : 100;

  return (
    <div className="sa-page">
      <Link to="/" className="back-home-btn">← Home</Link>
      {/* ── Header ── */}
      <header className="sa-header">
        <div>
          <h1>🤖 Safety Agent</h1>
          <p>AI-powered real-time workplace safety monitoring</p>
        </div>
        <div className="sa-header-controls">
          {!modelReady && !camError && <span className="sa-loading">Loading AI model…</span>}
          <button
            className={`sa-btn ${live ? 'stop' : 'start'}`}
            onClick={() => setLive((v) => !v)}
            disabled={!modelReady}
          >
            <span className={`dot ${live ? 'on' : 'off'}`} />
            {live ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        </div>
      </header>

      {/* ── Stat cards ── */}
      <section className="sa-stats">
        <div className="sa-stat blue">
          <span className="sa-stat-icon">👤</span>
          <div>
            <span className="sa-stat-value">{persons}</span>
            <span className="sa-stat-label">Persons Detected</span>
          </div>
        </div>
        <div className="sa-stat green">
          <span className="sa-stat-icon">⛑</span>
          <div>
            <span className="sa-stat-value">{helmets}</span>
            <span className="sa-stat-label">Helmets On</span>
          </div>
        </div>
        <div className={`sa-stat ${noHelmet > 0 ? 'red' : 'neutral'}`}>
          <span className="sa-stat-icon">⚠</span>
          <div>
            <span className="sa-stat-value">{violations}</span>
            <span className="sa-stat-label">Total Violations</span>
          </div>
        </div>
        <div className={`sa-stat ${compliance === 100 ? 'green' : compliance >= 50 ? 'amber' : 'red'}`}>
          <span className="sa-stat-icon">✓</span>
          <div>
            <span className="sa-stat-value">{compliance}%</span>
            <span className="sa-stat-label">Compliance Rate</span>
          </div>
        </div>
      </section>

      {/* ── Main content ── */}
      <div className="sa-body">

        {/* Camera feed */}
        <section className="sa-card sa-camera">
          <div className="sa-card-header">
            <h2>Live Feed</h2>
            <span className={`sa-status ${live ? 'live' : 'idle'}`}>
              <span className={`dot ${live ? 'on' : 'off'}`} />
              {live ? 'MONITORING' : 'IDLE'}
            </span>
          </div>
          <div className="sa-feed">
            <video ref={videoRef} autoPlay playsInline muted
              className={`sa-video ${live ? 'visible' : ''}`} />
            <canvas ref={canvasRef} className="sa-canvas" />
            {!live && (
              <div className="sa-feed-placeholder">
                <span>🔍</span>
                <p>Click <strong>Start Monitoring</strong> to activate</p>
              </div>
            )}
            {camError && <div className="sa-feed-error">⚠ {camError}</div>}
            <div className="sa-feed-overlay">
              <span>ZONE A · CAM 01</span>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Persons count field — prominent */}
          <div className="sa-persons-field">
            <span className="sa-persons-label">Persons in Frame</span>
            <span className={`sa-persons-count ${persons > 0 ? 'active' : ''}`}>{persons}</span>
            <span className="sa-persons-sub">
              {persons === 0
                ? 'Zone clear'
                : noHelmet > 0
                  ? `${noHelmet} without helmet`
                  : 'All compliant ✓'}
            </span>
          </div>
        </section>

        {/* Activity log */}
        <section className="sa-card sa-log">
          <div className="sa-card-header">
            <h2>Agent Activity Log</h2>
            <span className="sa-log-count">{activityLog.length} events</span>
          </div>
          <ul className="sa-log-list">
            {activityLog.map((entry) => (
              <li key={entry.id} className={`sa-log-entry ${entry.type}`}>
                <span className="sa-log-time">{entry.time}</span>
                <span className="sa-log-msg">{entry.message}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Safety rules ── */}
      <section className="sa-rules">
        <h2>Active Safety Rules</h2>
        <div className="sa-rules-grid">
          {RULES.map((r) => (
            <div key={r.id} className="sa-rule">
              <span className="sa-rule-icon">{r.icon}</span>
              <div>
                <strong>{r.label}</strong>
                <p>{r.desc}</p>
              </div>
              <span className="sa-rule-badge">Active</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
