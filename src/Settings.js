import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import './Settings.css';

export default function Settings() {
  const { settings, update: updateSetting, save } = useSettings();
  const [saved, setSaved] = useState(false);

  const update = (key, value) => {
    updateSetting(key, value);
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    save();
    setSaved(true);
  };

  return (
    <div className="settings">
      <Link to="/" className="back-home-btn">← Home</Link>
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Configure your command center preferences.</p>
      </header>

      <form className="settings-form" onSubmit={handleSave}>
        <section className="settings-group">
          <h2>General</h2>
          <label className="field">
            <span>Organization Name</span>
            <input
              type="text"
              value={settings.orgName}
              onChange={(e) => update('orgName', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Theme</span>
            <select value={settings.theme} onChange={(e) => update('theme', e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
        </section>

        <section className="settings-group">
          <h2>Notifications</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => update('notifications', e.target.checked)}
            />
            <span>Enable in-app notifications</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.emailAlerts}
              onChange={(e) => update('emailAlerts', e.target.checked)}
            />
            <span>Email alerts</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.smsAlerts}
              onChange={(e) => update('smsAlerts', e.target.checked)}
            />
            <span>SMS alerts</span>
          </label>
          <label className="field">
            <span>Alert Threshold</span>
            <select
              value={settings.alertThreshold}
              onChange={(e) => update('alertThreshold', e.target.value)}
            >
              <option value="low">Low — notify on everything</option>
              <option value="medium">Medium — warnings and above</option>
              <option value="high">High — critical only</option>
            </select>
          </label>
        </section>

        <section className="settings-group">
          <h2>Dashboard</h2>
          <label className="field">
            <span>Refresh Rate: {settings.refreshRate}s</span>
            <input
              type="range"
              min="1"
              max="30"
              value={settings.refreshRate}
              onChange={(e) => update('refreshRate', Number(e.target.value))}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.aiRecommendations}
              onChange={(e) => update('aiRecommendations', e.target.checked)}
            />
            <span>Show AI recommendations</span>
          </label>
        </section>

        <div className="settings-actions">
          <button type="submit" className="save-btn">Save Changes</button>
          {saved && <span className="saved-msg">✓ Settings saved</span>}
        </div>
      </form>
    </div>
  );
}
