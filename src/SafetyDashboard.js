import ReportDashboard from './ReportDashboard';

export default function SafetyDashboard() {
  return <ReportDashboard title="Safety Dashboard" subjectFallback="Safety.Dashboard" endpointPath="/api/safety-dashboard/reports" shieldIcon="🛡️" />;
}
