import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const initialAlerts = [
  { id: 1, level: 'critical', title: 'Fire detected — Zone A', time: '12:03:11' },
  { id: 2, level: 'warning', title: 'Unauthorized access — Gate 4', time: '11:47:52' },
  { id: 3, level: 'info', title: 'Camera 2 back online', time: '11:20:05' },
];

const incidents = [
  { id: 1, time: '12:03', title: 'Fire alarm triggered', detail: 'Smoke sensor + camera confirmation in Zone A.' },
  { id: 2, time: '11:48', title: 'Access violation', detail: 'Badge not recognized at Gate 4, 2 attempts.' },
  { id: 3, time: '11:15', title: 'Crowd density spike', detail: 'Occupancy exceeded threshold in Hall B.' },
  { id: 4, time: '10:52', title: 'System check', detail: 'All cameras healthy, models nominal.' },
];

const recommendations = [
  { id: 1, priority: 'High', text: 'Dispatch response team to Zone A immediately.' },
  { id: 2, priority: 'Medium', text: 'Lock down Gate 4 and review access logs.' },
  { id: 3, priority: 'Low', text: 'Increase sampling rate on Hall B camera during peak hours.' },
];

function LiveCamera() {
  const [live, setLive]             = useState(false);
  const [error, setError]           = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [detections, setDetections] = useState({ persons: 0, helmets: 0 });
  const [time, setTime]             = useState(new Date().toLocaleTimeString());

  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const offscreenRef  = useRef(null);   // hidden canvas for pixel sampling
  const streamRef     = useRef(null);
  const modelRef      = useRef(null);
  const rafRef        = useRef(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // Create offscreen canvas + load COCO-SSD model
  useEffect(() => {
    offscreenRef.current = document.createElement('canvas');
    const detector = window.cocoSsd;
    if (!detector) {
      setError('AI model script not ready. Check internet connection and refresh.');
      return;
    }
    detector.load()
      .then((model) => { modelRef.current = model; setModelReady(true); })
      .catch(() => setError('Failed to load AI model.'));
  }, []);

  // ── Helmet detection via head-region color sampling ──────────────────────
  // Samples the top 25% of the person bounding box (head area) and checks for
  // hard-hat colors: yellow, white, orange, red, blue.
  const hasHelmet = useCallback((video, bbox) => {
    const offscreen = offscreenRef.current;
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
    try { imageData = octx.getImageData(rx, ry, rw, rh); }
    catch (_) { return false; }

    const data = imageData.data;
    const total = data.length / 4;
    let helmetPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Yellow hard hat
      if (r > 180 && g > 140 && b < 100) { helmetPixels++; continue; }
      // White hard hat
      if (r > 190 && g > 190 && b > 190) { helmetPixels++; continue; }
      // Orange hard hat
      if (r > 190 && g > 70 && g < 160 && b < 70) { helmetPixels++; continue; }
      // Red hard hat
      if (r > 160 && g < 90 && b < 90) { helmetPixels++; continue; }
      // Blue hard hat
      if (r < 100 && g < 130 && b > 150) { helmetPixels++; continue; }
    }

    return (helmetPixels / total) > 0.12;
  }, []);

  // ── Draw bounding boxes ───────────────────────────────────────────────────
  const drawDetections = useCallback((predictions, video) => {
    const canvas = canvasRef.current;
    if (!canvas || !video) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let personCount = 0;
    let helmetCount = 0;

    predictions.forEach((pred) => {
      if (pred.class !== 'person') return;
      personCount++;

      const [x, y, w, h] = pred.bbox;
      const conf       = Math.round(pred.score * 100);
      const helmetOn   = hasHelmet(video, pred.bbox);
      if (helmetOn) helmetCount++;

      const boxColor  = helmetOn ? '#00e676' : '#f44336';
      const labelText = helmetOn ? `⛑ HELMET  ${conf}%` : `⚠ NO HELMET  ${conf}%`;
      const labelW    = Math.max(w, 160);

      // Bounding box
      ctx.strokeStyle = boxColor;
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(x, y, w, h);

      // Corner markers
      const m = 12;
      ctx.lineWidth = 3;
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + (cx === x ? m : -m), cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + (cy === y ? m : -m));
        ctx.stroke();
      });

      // Label background
      ctx.fillStyle = boxColor;
      ctx.fillRect(x, y - 26, labelW, 26);

      // Label text
      ctx.fillStyle = '#000';
      ctx.font      = 'bold 13px monospace';
      ctx.fillText(labelText, x + 5, y - 8);
    });

    setDetections({ persons: personCount, helmets: helmetCount });
  }, [hasHelmet]);

  // ── Detection loop ────────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    const video = videoRef.current;
    const model = modelRef.current;
    if (!video || !model || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }
    const predictions = await model.detect(video);
    drawDetections(predictions, video);
    rafRef.current = requestAnimationFrame(detect);
  }, [drawDetections]);

  // ── Start / stop webcam ───────────────────────────────────────────────────
  useEffect(() => {
    if (live) {
      setError(null);
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              rafRef.current = requestAnimationFrame(detect);
            };
          }
        })
        .catch((err) => {
          setLive(false);
          setError('Camera access denied or unavailable.');
          console.error(err);
        });
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      setDetections({ persons: 0, helmets: 0 });
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [live, detect]);

  const noHelmetCount = detections.persons - detections.helmets;

  return (
    <section className="card camera">
      <div className="card-header">
        <h2>Live Camera</h2>
        <div className="cam-controls">
          {live && detections.persons > 0 && (
            <span className="person-badge">
              👤 {detections.persons} Person{detections.persons > 1 ? 's' : ''}
            </span>
          )}
          {live && detections.persons > 0 && detections.helmets > 0 && (
            <span className="helmet-badge safe">⛑ {detections.helmets} Helmet{detections.helmets > 1 ? 's' : ''}</span>
          )}
          {live && noHelmetCount > 0 && (
            <span className="helmet-badge warn">⚠ {noHelmetCount} No Helmet</span>
          )}
          {!modelReady && !error && (
            <span className="model-loading">Loading AI model…</span>
          )}
          <button className="pill" onClick={() => setLive((v) => !v)} disabled={!modelReady}>
            <span className={`dot ${live ? 'on' : 'off'}`} />
            {live ? 'LIVE' : 'START'}
          </button>
        </div>
      </div>

      <div className="camera-feed">
        <video ref={videoRef} autoPlay playsInline muted
          className={`camera-video ${live ? 'visible' : ''}`} />
        <canvas ref={canvasRef} className="detection-canvas" />

        {!live && (
          <div className="camera-placeholder">
            <span className="camera-off-icon">📷</span>
            <p>Click <strong>START</strong> to enable camera, person &amp; helmet detection</p>
          </div>
        )}
        {error && <div className="camera-error">⚠ {error}</div>}

        <div className="camera-overlay">
          <span>CAM 01 · Zone A</span>
          <span>{time}</span>
        </div>
        {live && <div className="scanline" />}
      </div>

      <div className="camera-thumbs">
        {['CAM 02', 'CAM 03', 'CAM 04', 'CAM 05'].map((c) => (
          <div className="thumb" key={c}>{c}</div>
        ))}
      </div>
    </section>
  );
}

function Alerts() {
  return (
    <section className="card alerts">
      <div className="card-header">
        <h2>Alerts</h2>
        <span className="count">{initialAlerts.length}</span>
      </div>
      <ul className="alert-list">
        {initialAlerts.map((a) => (
          <li key={a.id} className={`alert ${a.level}`}>
            <span className="alert-level">{a.level}</span>
            <span className="alert-title">{a.title}</span>
            <span className="alert-time">{a.time}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IncidentTimeline() {
  return (
    <section className="card timeline">
      <div className="card-header">
        <h2>Incident Timeline</h2>
      </div>
      <ol className="timeline-list">
        {incidents.map((i) => (
          <li key={i.id} className="timeline-item">
            <span className="timeline-time">{i.time}</span>
            <div className="timeline-body">
              <strong>{i.title}</strong>
              <p>{i.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AIRecommendations() {
  return (
    <section className="card recommendations">
      <div className="card-header">
        <h2>AI Recommendations</h2>
      </div>
      <ul className="rec-list">
        {recommendations.map((r) => (
          <li key={r.id} className="rec">
            <span className={`rec-priority ${r.priority.toLowerCase()}`}>{r.priority}</span>
            <span className="rec-text">{r.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  return (
    <div className="dashboard">
      <Link to="/" className="back-home-btn">← Home</Link>
      <header className="dashboard-header">
        <h1>Warehouse Monitoring System</h1>
        <p>Real-time monitoring &amp; AI-assisted response</p>
      </header>
      <main className="dashboard-grid">
        <LiveCamera />
        <Alerts />
        <IncidentTimeline />
        <AIRecommendations />
      </main>
    </div>
  );
}
